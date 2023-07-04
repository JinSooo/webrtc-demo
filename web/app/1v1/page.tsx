'use client'

import { Alert, AlertIcon, Button, Input, Select } from '@chakra-ui/react'
import { ChangeEvent, useEffect, useRef, useState, KeyboardEvent } from 'react'
import io, { Socket } from 'socket.io-client'
import { useToast } from '@chakra-ui/react'
import useWebRTC from '@/hook/useWebRTC'

// 生成一个userId
const userId = Math.random().toString(36).substring(2)
let socket: Socket
let localStream: MediaStream
let remoteStream: MediaStream
// 加入的房间号
let realRoomId = ''
// 保存本地流的track记录，用于切换摄像头时删除原本的本地流
let sender: RTCRtpSender
// 摄像头option
const constraint = {
	video: {
		frameRate: { min: 20 }, // 帧率最小 20 帧每秒
		width: { min: 640, ideal: 1280 },
		height: { min: 360, ideal: 720 },
		aspectRatio: 16 / 9, // 宽高比
	},
	audio: {
		echoCancellation: true, // 开启回音消除
		noiseSuppression: true, // 降噪
		autoGainControl: true, // 自动增益
	},
}
let mediaRecorder: MediaRecorder
// 录制数据的缓冲区
let buffer: Blob[] = []

export default function Page() {
	const localVideoRef = useRef<HTMLVideoElement>(null)
	const remoteVideoRef = useRef<HTMLVideoElement>(null)
	const { pc, dc, createOffer, createAnswer, addAnswer } = useWebRTC()
	const toast = useToast({ position: 'top' })

	// 所有视频输入设备
	const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
	const [roomId, setRoomId] = useState('')
	const [message, setMessage] = useState('')
	const [isJoin, setIsJoin] = useState(false)
	const [hasVideo, setHasVideo] = useState(true)
	const [hasAudio, setHasAudio] = useState(true)

	// 初始化websocket
	const initSocket = () => {
		socket = io('https://192.168.1.12:8080/')
		socket.on('connection', () => {})
		socket.on('disconnection', reason => {
			if (reason === 'io server disconnect') {
				// 断线是由服务器发起的，重新连接。
				socket.connect()
			} else {
				toast({ status: 'error', description: '您已断开连接' })
			}
		})
		socket.on('error', err => {
			toast({ status: 'error', description: err })
		})
		socket.on('welcome', data => {
			toast({ status: 'info', description: `${data.userId} 加入房间` })
		})
		socket.on('leave', data => {
			toast({ status: 'info', description: `${data.userId} 离开房间` })
		})
		socket.on('sdp', data => {
			// if (data.userId === userId) return
			switch (data.type) {
				case 'offer':
					createOffer(socket, userId, realRoomId)
					break
				case 'answer':
					createAnswer(socket, userId, realRoomId, data.sdp)
					break
				case 'addAnswer':
					addAnswer(data.sdp)
					break
			}
		})
	}
	// 初始化WebRTC
	const initWebRTC = async () => {
		// localStream = await navigator.mediaDevices.getUserMedia(constraint)
		remoteStream = new MediaStream()
		localVideoRef.current!.srcObject = localStream
		remoteVideoRef.current!.srcObject = remoteStream
		// 添加本地流
		localStream.getTracks().forEach(track => {
			sender = pc.addTrack(track, localStream)
		})
		// 监听添加远程流
		pc.ontrack = event => {
			console.log(event)
			event.streams[0].getTracks().forEach(track => {
				remoteStream.addTrack(track)
			})
		}

		// datachannel
		pc.ondatachannel = ev => {
			ev.channel.onopen = () => {}
			// 当文件通道关闭时触发
			ev.channel.onclose = () => {}
			// 当文件通道发生错误时触发
			ev.channel.onerror = () => {}
			// 当文件通道收到消息时触发
			ev.channel.onmessage = e => {
				toast({ status: 'info', description: `对端发送消息: ${e.data}` })
			}
		}
	}
	// 打开摄像头
	const openCamera = async () => {
		localStream = await navigator.mediaDevices.getUserMedia(constraint)
		initWebRTC()
	}
	// 打开共享屏幕
	const openShareScreen = async () => {
		localStream = await navigator.mediaDevices.getDisplayMedia()
		initWebRTC()
	}
	// 关闭音频流
	const toggleAudio = () => {
		const status = !hasAudio
		setHasAudio(status)

		localStream.getAudioTracks().forEach(track => {
			track.enabled = status
		})
	}
	// 关闭视频流
	const toggleVideo = () => {
		const status = !hasVideo
		setHasVideo(status)

		localStream.getVideoTracks().forEach(track => {
			track.enabled = status
		})
	}
	// 截图
	const capture = () => {
		// 将视频图片映射到canvas中，转为base64
		const canvas = document.createElement('canvas')
		canvas.width = localVideoRef.current!.clientWidth
		canvas.height = localVideoRef.current!.clientHeight
		const ctx = canvas.getContext('2d')
		ctx?.drawImage(localVideoRef.current as any, 0, 0, localVideoRef.current!.clientWidth, localVideoRef.current!.clientHeight)

		// 下载
		const url = canvas.toDataURL('base64')
		const a = document.createElement('a')
		a.href = url
		a.download = Date.now() + '.png'
		a.click()
		URL.revokeObjectURL(url)
		a.remove()
	}
	// 开始录制
	const startRecord = () => {
		mediaRecorder = new MediaRecorder(localStream, {
			audioBitsPerSecond: 128000,
			videoBitsPerSecond: 2500000,
			mimeType: 'video/webm; codecs="vp8,opus"',
		})
		mediaRecorder.start()

		mediaRecorder.onstart = () => {}
		// 接受到的数据
		mediaRecorder.ondataavailable = e => {
			buffer.push(e.data)
		}
		mediaRecorder.onstop = () => {
			const blob = new Blob(buffer, { type: 'video/mp4' })

			// 下载MP4
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = Date.now() + '.mp4'
			a.click()
			URL.revokeObjectURL(url)
			a.remove()
		}
	}
	// 停止录制
	const stopRecord = () => {
		mediaRecorder.stop()
		buffer = []
	}
	// 加入房间
	const join = () => {
		if (!roomId.length) return
		socket.emit('join', { userId, roomId })
		setIsJoin(true)
		realRoomId = roomId
	}
	// 离开房间
	const leave = () => {
		pc.close()
		socket.emit('leave', { userId, roomId })
		setIsJoin(false)
		realRoomId = ''
	}
	// 获取视频输入设备
	const getDevices = async () => {
		const allDevices = await navigator.mediaDevices.enumerateDevices()
		const videoDevices = allDevices.filter(device => device.kind === 'videoinput')
		setVideoDevices(videoDevices)
	}
	// 切换设备
	const handleDevice = async (e: ChangeEvent<HTMLSelectElement>) => {
		// 删除之前的本地流
		pc.removeTrack(sender)
		localStream = await navigator.mediaDevices.getUserMedia({
			...constraint,
			video: {
				deviceId: e.target.value,
			},
		})
		localVideoRef.current!.srcObject = localStream
		// 重写添加本地流
		localStream.getTracks().forEach(track => {
			sender = pc.addTrack(track, localStream)
		})
	}
	// 发送消息
	const sendMessage = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			// @ts-ignore
			dc.send(e.target.value)
			// @ts-ignore
			e.target.value = ''
		}
	}

	useEffect(() => {
		// initWebRTC()
		initSocket()
		getDevices()
	}, [])

	return (
		<div className="px-2 py-1 md:px-20 md:py-10">
			<Alert status="info">
				<AlertIcon />
				当前房间号: {roomId}
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
					<Button colorScheme="teal" onClick={toggleAudio}>
						Toggle Audio Stream
					</Button>
					<Button colorScheme="teal" onClick={toggleVideo}>
						Toggle Video Stream
					</Button>
					<Select width={300} onChange={handleDevice}>
						{videoDevices.map(device => (
							<option key={device.deviceId} value={device.deviceId}>
								{device.label}
							</option>
						))}
					</Select>
					<Button colorScheme="teal" onClick={capture}>
						Capture
					</Button>
					<Button colorScheme="teal" onClick={startRecord}>
						Start Record
					</Button>
					<Button colorScheme="teal" onClick={stopRecord}>
						Stop Record
					</Button>
				</div>
				<div className="flex gap-4">
					<Input placeholder="room id" onChange={e => setRoomId(e.target.value)} disabled={isJoin} width={200} />
					<Button colorScheme="teal" onClick={join}>
						Join
					</Button>
					<Button colorScheme="teal" onClick={leave}>
						Leave
					</Button>
					<Input placeholder="send message" onKeyDown={sendMessage} width={200} />
				</div>
			</div>
			{/* 视频流 */}
			<div className="flex gap-4 mt-10 flex-wrap">
				<div>
					<p>本地流:</p>
					<video ref={localVideoRef} width={640} height={360} autoPlay playsInline muted></video>
				</div>
				<div>
					<p>远程流:</p>
					<video ref={remoteVideoRef} width={640} height={360} autoPlay playsInline></video>
				</div>
			</div>
		</div>
	)
}
