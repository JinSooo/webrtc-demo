'use client'

import { Alert, AlertIcon, Button } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'
import io, { Socket } from 'socket.io-client'
import { useToast } from '@chakra-ui/react'
import * as mediasoup from 'mediasoup-client'
import { Transport } from 'mediasoup-client/lib/types'

// 生成一个userId
const userId = Math.random().toString(36).substring(2)
let socket: Socket
let device: mediasoup.Device
let producerTransport: Transport
let consumerTransport: Transport
let remoteCount = 1
let consumerId = ''
let stream: MediaStream

export default function Page() {
	const localVideoRef = useRef<HTMLVideoElement>(null)
	const remoteVideoRef = useRef<HTMLVideoElement>(null)
	const toast = useToast({ position: 'top' })

	const loadDevice = async (routerRtpCapabilities: any) => {
		device = new mediasoup.Device()
		// 使用mediasoup路由器的RTP功能加载设备
		await device.load({ routerRtpCapabilities })
	}
	const getUserMedia = async (transport: Transport, isWebcam: boolean) => {
		let stream
		if (isWebcam) {
			stream = await navigator.mediaDevices.getUserMedia({ video: true })
		} else {
			stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
		}
		const track = stream.getVideoTracks()[0]
		// 指示传输将音频或视频轨道发送到 mediasoup 路由器
		await transport.produce({ track })
		return stream
	}
	const initProducer = async () => {
		const data = await socket.request('createProducerTransport', {
			forceTcp: false,
			rtpCapabilities: device.rtpCapabilities,
		})
		// let stream: MediaStream
		// 创建一个新的webbrtc传输来发送媒体。传输必须事先通过router.createwebrtctransport()在mediasoup路由器中创建
		producerTransport = device.createSendTransport(data)
		// 建立ICE DTLS连接，并需要与相关的服务器端传输交换信息
		producerTransport.on('connect', async ({ dtlsParameters }, callback, errCallback) => {
			// callback的作用: 告诉传输方参数已传输
			socket
				.request('connectProducerTransport', { transportId: producerTransport.id, dtlsParameters })
				.then(callback)
				.catch(errCallback)
		})
		// 当传输需要将有关新生产者的信息传输到关联的服务器端传输时发出。该事件发生在 Produce() 方法完成之前
		producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errCallback) => {
			socket
				.request('produce', { transportId: producerTransport.id, kind, rtpParameters })
				.then(id => callback({ id }))
				.catch(errCallback)
		})
		producerTransport.on('connectionstatechange', state => {
			switch (state) {
				case 'connecting':
					console.log('publishing...')
					break
				case 'connected':
					console.log('published')
					// localVideoRef.current!.srcObject = stream
					break
				case 'failed':
					console.log('failed')
					producerTransport.close()
					break
			}
		})
	}
	const initConsumer = async () => {
		const data = await socket.request('createConsumerTransport', {
			forceTcp: false,
		})
		// let stream: MediaStream
		// 创建一个新的WebRTC传输来接收媒体。传输必须事先通过router.createwebrtctransport()在mediasoup路由器中创建
		consumerTransport = device.createRecvTransport(data)
		consumerTransport.on('connect', async ({ dtlsParameters }, callback, errCallback) => {
			socket
				.request('connectConsumerTransport', { dtlsParameters, transportId: consumerTransport.id })
				.then(callback)
				.catch(errCallback)
		})
		consumerTransport.on('connectionstatechange', async state => {
			switch (state) {
				case 'connecting':
					console.log('subscribing...')
					break
				case 'connected':
					console.log('subscribed')
					// remoteVideoRef.current!.srcObject = stream
					// await socket.request('resume', {
					// 	consumerId,
					// 	transportId: consumerTransport.id,
					// })
					break
				case 'failed':
					console.log('failed')
					consumerTransport.close()
					break
			}
		})
	}
	const connectMediasoup = () => {
		initProducer()
		initConsumer()
	}
	const publish = async (isWebcam: boolean) => {
		const stream = await getUserMedia(producerTransport, isWebcam)
		console.log(stream)
		;(document.getElementById(`remote-${remoteCount++}`) as HTMLVideoElement).srcObject = stream
	}
	const subscribe = async (producerId: string) => {
		const data = await socket.request('consume', {
			producerId,
			transportId: consumerTransport.id,
			rtpCapabilities: device.rtpCapabilities,
		})
		consumerId = data.id
		// 指示传输从 mediasoup 路由器接收音频或视频轨道
		const consumer = await consumerTransport.consume({
			id: data.id,
			producerId: data.producerId,
			kind: data.kind,
			rtpParameters: data.rtpParameters,
		})
		stream = new MediaStream()
		stream.addTrack(consumer.track)
		;(document.getElementById(`remote-${remoteCount++}`) as HTMLVideoElement).srcObject = stream
	}

	// 初始化websocket
	const initSocket = () => {
		socket = io('https://192.168.1.12:8080/')
		socket.on('connect', async () => {
			const data = await socket.request('getRouterRtpCapabilities')
			await loadDevice(data)
			connectMediasoup()
		})
		socket.on('new', data => {
			subscribe(data.producerId)
		})
		socket.on('self', data => {
			for (const producerId of data.producerArr) {
				subscribe(producerId)
			}
		})
		// 直接加到socket源码里
		// request<T = any>(ev: Ev, ...args: EventParams<EmitEvents, Ev>): Promise<T>
		socket.request = (ev, data) => {
			return new Promise(resolve => {
				socket.emit(ev, data, resolve)
			})
		}
	}
	// 打开摄像头
	const openCamera = async () => publish(true)
	// 打开共享屏幕
	const openShareScreen = async () => publish(false)
	const join = () => {
		socket.emit('join', {
			roomId: '1',
			peerId: userId,
		})
	}
	const leave = () => {
		producerTransport.close()
	}

	useEffect(() => {
		// initWebRTC()
		initSocket()
	}, [])

	return (
		<div className="px-2 py-1 md:px-20 md:py-10">
			<Alert status="info">
				<AlertIcon />
				当前房间号: {}
			</Alert>
			{/* 控制 */}
			<div className="my-4">
				<div className="flex gap-4 flex-wrap mb-4">
					<Button colorScheme="teal" onClick={openCamera}>
						Open Camera
					</Button>
					<Button colorScheme="teal" onClick={openShareScreen}>
						Open ShareScreen
					</Button>
				</div>
				<div className="flex gap-4">
					<Button colorScheme="teal" onClick={join}>
						join
					</Button>
					<Button colorScheme="teal" onClick={leave}>
						leave
					</Button>
				</div>
			</div>
			{/* 视频流 */}
			<div className="flex gap-4 mt-10 flex-wrap justify-center">
				{/* {new Array(remoteCount).map((_, index) => (
					<video id={`remote-${index}`} key={`remote-${index}`} className="w-[98%] md:w-[48%]" autoPlay playsInline muted></video>
				))} */}
				<video id="remote-1" className="w-[98%] md:w-[48%]" autoPlay playsInline muted></video>
				<video id="remote-2" className="w-[98%] md:w-[48%]" autoPlay playsInline muted></video>
				<video id="remote-3" className="w-[98%] md:w-[48%]" autoPlay playsInline muted></video>
				<video id="remote-4" className="w-[98%] md:w-[48%]" autoPlay playsInline muted></video>
			</div>
		</div>
	)
}
