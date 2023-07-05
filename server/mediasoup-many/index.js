import Fastify from 'fastify'
import { Server } from 'socket.io'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import mediasoup from 'mediasoup'
import config from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const MAX_SIZE_PER_ROOM = 10

// 所有房间
const rooms = new Map()
// 所有连接的客户端
const peers = new Map()
// 当前连接的producer
const producerArr = []

/* -------------------------------- Mediasoup ------------------------------- */
// 初始化
mediasoup.observer.on('newworker', worker => {
	worker.appData.routers = new Map()

	worker.observer.on('newrouter', router => {
		router.appData.worker = worker
		router.appData.transports = new Map()
		worker.appData.routers.set(router.id, router)

		router.observer.on('close', () => worker.appData.routers.delete(router.id))
		router.observer.on('newtransport', transport => {
			transport.appData.router = router
			transport.appData.producers = new Map()
			transport.appData.consumers = new Map()
			router.appData.transports.set(transport.id, transport)

			transport.observer.on('newproducer', producer => {
				producer.appData.transport = transport
				transport.appData.producers.set(producer.id, producer)
				transport.observer.on('close', () => transport.appData.producers.delete(producer.id))
			})
			transport.observer.on('newconsumer', consumer => {
				consumer.appData.transport = transport
				transport.appData.consumers.set(consumer.id, consumer)
				transport.observer.on('close', () => transport.appData.consumers.delete(consumer.id))
			})
		})
	})
})
// 暂时只先创建一个Worker和一个Router
const mediasoupWorker = await mediasoup.createWorker({
	logLevel: config.mediasoup.worker.logLevel,
	logTags: config.mediasoup.worker.logTags,
	rtcMinPort: config.mediasoup.worker.rtcMinPort,
	rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
})
const mediasoupRouter = await mediasoupWorker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs })

/* --------------------------------- server --------------------------------- */
const fastify = Fastify({
	logger: true,
	// HTTPS 证书
	https: {
		cert: readFileSync(join(__dirname, config.sslCrt)),
		key: readFileSync(join(__dirname, config.sslKey)),
	},
})

await fastify.listen({ host: config.listenIp, port: config.listenPort })

/* -------------------------------- websocket ------------------------------- */
const io = new Server(fastify.server, { cors: true })
io.on('connection', socket => {
	socket.on('join', data => {
		const { roomId, peerId } = data
		const room = getOrCreateRoom(roomId)
		let peer = peers.get(peerId)
		// 用户已经存在
		if (peer) {
			socket.disconnect(true)
			return
		}
		peer = {
			roomId,
			socket,
			id: peerId,
		}
		peers.set(peerId, peer)

		joinRoom(room, peer)
	})

	// 获取支持的RTP类型
	socket.on('getRouterRtpCapabilities', (data, callback) => {
		callback(mediasoupRouter.rtpCapabilities)
	})

	socket.on('createProducerTransport', async (data, callback) => {
		const params = await createWebRTCTransport()
		callback(params)
	})

	socket.on('createConsumerTransport', async (data, callback) => {
		const params = await createWebRTCTransport()
		callback(params)
	})

	// 将web端的transport与server端的transport连起来
	socket.on('connectProducerTransport', async (data, callback) => {
		const transport = mediasoupRouter.appData.transports.get(data.transportId)
		await transport.connect({ dtlsParameters: data.dtlsParameters })
		callback()
	})

	socket.on('connectConsumerTransport', async (data, callback) => {
		const transport = mediasoupRouter.appData.transports.get(data.transportId)
		await transport.connect({ dtlsParameters: data.dtlsParameters })
		callback()
	})

	socket.on('produce', async (data, callback) => {
		const transport = mediasoupRouter.appData.transports.get(data.transportId)
		// 指示路由器接收音频或视频RTP。这是将媒体注入mediasoup的方法
		const producer = await transport.produce({ kind: data.kind, rtpParameters: data.rtpParameters })
		callback({ producerId: producer.id })

		// TODO: 用于连接其他客户端
		socket.broadcast.emit('new', { producerId: producer.id })
		// 自身连接其他所有
		// socket.emit('self', { producerArr: producerArr })

		// producerArr.push(producer.id)
	})

	socket.on('consume', async (data, callback) => {
		const transport = mediasoupRouter.appData.transports.get(data.transportId)
		const params = await createConsumer(transport, data.producerId, data.rtpCapabilities)
		callback(params)
	})

	socket.on('resume', async (data, callback) => {
		// 恢复生产者。在所有相关的消费者中触发“producerresume”事件。
		const transport = mediasoupRouter.appData.transports.get(data.transportId)
		const consumer = transport.appData.consumers.get(data.consumerId)
		await consumer.resume()
		callback()
	})
})

// Producer
const createWebRTCTransport = async () => {
	const { listenIps, initialAvailableOutgoingBitrate, maxIncomingBitrate } = config.mediasoup.webRtcTransport
	const transport = await mediasoupRouter.createWebRtcTransport({
		listenIps,
		initialAvailableOutgoingBitrate,
		enableUdp: true,
		enableTcp: true,
		preferUdp: true,
	})
	if (maxIncomingBitrate) {
		await transport.setMaxIncomingBitrate(maxIncomingBitrate)
	}

	return {
		id: transport.id,
		iceParameters: transport.iceParameters,
		iceCandidates: transport.iceCandidates,
		dtlsParameters: transport.dtlsParameters,
	}
}

// Consumer
const createConsumer = async (transport, producerId, rtpCapabilities) => {
	if (!mediasoupRouter.canConsume({ rtpCapabilities, producerId })) return

	// 指示路由器发送音频或视频RTP。这是从mediasoup中提取媒体的方法。
	const consumer = await transport.consume({
		producerId,
		rtpCapabilities,
		// paused: producer.kind === 'video',
		paused: false,
	})
	if (consumer.type === 'simulcast') {
		await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 })
	}

	return {
		producerId,
		id: consumer.id,
		kind: consumer.kind,
		type: consumer.type,
		rtpParameters: consumer.rtpParameters,
		producerPaused: consumer.producerPaused,
	}
}

const getOrCreateRoom = roomId => {
	let room = rooms.get(roomId)
	if (!room) {
		room = {
			id: roomId,
			mediasoupWorker: mediasoupWorker,
			peers: new Map(),
		}
	}
	return room
}

const joinRoom = (room, peer) => {
	if (Object.keys(room.peers).length >= MAX_SIZE_PER_ROOM) {
		console.log(`Room ${room.id} is already full`)
		return
	}

	room.peers.set(peer.id, peer)
	peer.socket.join(peer.roomId)
	peer.socket.to(peer.roomId).emit('welcome', peer.id)
}
