import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'

const useWebRTC = () => {
	const { current: pc } = useRef(new RTCPeerConnection())
	const { current: dc } = useRef(pc.createDataChannel('chat'))

	const createOffer = async (socket: Socket, userId: string, roomId: string) => {
		const offer = await pc.createOffer()
		await pc.setLocalDescription(offer)

		let flag = true
		pc.onicecandidate = event => {
			if (event.candidate && flag) {
				flag = false
				socket.emit('sdp', {
					userId,
					roomId,
					type: 'answer',
					sdp: JSON.stringify(pc.localDescription),
				})
			}
		}
	}
	const createAnswer = async (socket: Socket, userId: string, roomId: string, offerSdp: string) => {
		const offer = JSON.parse(offerSdp)
		await pc.setRemoteDescription(offer)
		const answer = await pc.createAnswer()
		await pc.setLocalDescription(answer)

		let flag = true
		pc.onicecandidate = event => {
			if (event.candidate && flag) {
				flag = false
				socket.emit('sdp', {
					userId,
					roomId,
					type: 'addAnswer',
					sdp: JSON.stringify(pc.localDescription),
				})
			}
		}
	}
	const addAnswer = (answerSdp: string) => {
		const answer = JSON.parse(answerSdp)
		if (!pc.currentRemoteDescription) {
			pc.setRemoteDescription(answer)
		}
	}

	return {
		pc,
		dc,
		createOffer,
		createAnswer,
		addAnswer,
	}
}

export default useWebRTC
