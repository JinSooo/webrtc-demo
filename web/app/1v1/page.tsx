'use client'

import { Alert, AlertIcon, Button, Input, Select } from '@chakra-ui/react'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
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

export default function Page() {
	const localVideoRef = useRef<HTMLVideoElement>(null)
	const remoteVideoRef = useRef<HTMLVideoElement>(null)
	const { pc, createOffer, createAnswer, addAnswer } = useWebRTC()
	const toast = useToast()

	// 所有视频输入设备
	const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
	const [roomId, setRoomId] = useState('')
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
		localStream = await navigator.mediaDevices.getUserMedia(constraint)
		remoteStream = new MediaStream()
		localVideoRef.current!.srcObject = localStream
		remoteVideoRef.current!.srcObject = remoteStream
		// 添加本地流
		localStream.getTracks().forEach(track => {
			sender = pc.addTrack(track, localStream)
		})
		// 监听添加远程流
		pc.ontrack = event => {
			event.streams[0].getTracks().forEach(track => {
				remoteStream.addTrack(track)
			})
		}
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

	useEffect(() => {
		initWebRTC()
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
			<div className="flex my-4 justify-between flex-wrap">
				<div className="flex gap-4 flex-wrap">
					<Button colorScheme="teal" onClick={toggleAudio}>
						Toggle Audio
					</Button>
					<Button colorScheme="teal" onClick={toggleVideo}>
						Toggle Video
					</Button>
					<Select width={300} onChange={handleDevice}>
						{videoDevices.map(device => (
							<option key={device.deviceId} value={device.deviceId}>
								{device.label}
							</option>
						))}
					</Select>
				</div>
				<div className="flex gap-4">
					<Input placeholder="room id" onChange={e => setRoomId(e.target.value)} disabled={isJoin} />
					<Button colorScheme="teal" onClick={join}>
						Join
					</Button>
					<Button colorScheme="teal" onClick={leave}>
						Leave
					</Button>
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
