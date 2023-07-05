import Fastify from 'fastify'
import { Server } from 'socket.io'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import mediasoup from 'mediasoup'
import config from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* -------------------------------- Mediasoup ------------------------------- */
const mediasoupWorker = await mediasoup.createWorker({
	logLevel: config.mediasoup.worker.logLevel,
	logTags: config.mediasoup.worker.logTags,
	rtcMinPort: config.mediasoup.worker.rtcMinPort,
	rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
})
const mediasoupRouter = await mediasoupWorker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs })

let producerTransport
let consumerTransport
let producer
let consumer

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
	// 获取支持的RTP类型
	socket.on('getRouterRtpCapabilities', (data, callback) => {
		callback(mediasoupRouter.rtpCapabilities)
	})

	socket.on('createProducerTransport', async (data, callback) => {
		const { transport, params } = await createWebRTCTransport()
		producerTransport = transport
		callback(params)
	})

	socket.on('createConsumerTransport', async (data, callback) => {
		const { transport, params } = await createWebRTCTransport()
		consumerTransport = transport
		callback(params)
	})

	// 将web端的transport与server端的transport连起来
	socket.on('connectProducerTransport', async (data, callback) => {
		await producerTransport.connect({ dtlsParameters: data.dtlsParameters })
		callback()
	})

	socket.on('connectConsumerTransport', async (data, callback) => {
		await consumerTransport.connect({ dtlsParameters: data.dtlsParameters })
		callback()
	})

	socket.on('produce', async (data, callback) => {
		const { kind, rtpParameters } = data
		// 指示路由器接收音频或视频RTP。这是将媒体注入mediasoup的方法
		producer = await producerTransport.produce({ kind, rtpParameters })
		callback({ id: producer.id })

		socket.broadcast.emit('newProducer')
	})

	socket.on('consume', async (data, callback) => {
		callback(await createConsumer(producer, data.rtpCapabilities))
	})

	socket.on('resume', async (data, callback) => {
		// 恢复生产者。在所有相关的消费者中触发“producerresume”事件。
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
		transport,
		params: {
			id: transport.id,
			iceParameters: transport.iceParameters,
			iceCandidates: transport.iceCandidates,
			dtlsParameters: transport.dtlsParameters,
		},
	}
}

// Consumer
const createConsumer = async (producer, rtpCapabilities) => {
	if (!mediasoupRouter.canConsume({ rtpCapabilities, producerId: producer.id })) return

	// 指示路由器发送音频或视频RTP。这是从mediasoup中提取媒体的方法。
	consumer = await consumerTransport.consume({
		producerId: producer.id,
		rtpCapabilities,
		paused: producer.kind === 'video',
	})
	if (consumer.type === 'simulcast') {
		await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 })
	}

	return {
		producerId: producer.id,
		id: consumer.id,
		kind: consumer.kind,
		type: consumer.type,
		rtpParameters: consumer.rtpParameters,
		producerPaused: consumer.producerPaused,
	}
}
