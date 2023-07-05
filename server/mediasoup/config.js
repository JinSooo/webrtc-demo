const config = {
	listenIp: '0.0.0.0',
	listenPort: 8080,
	sslCrt: '../lib/localhost+2.pem',
	sslKey: '../lib/localhost+2-key.pem',
	mediasoup: {
		// Worker settings
		worker: {
			rtcMinPort: 10000,
			rtcMaxPort: 10100,
			logLevel: 'warn',
			logTags: [
				'info',
				'ice',
				'dtls',
				'rtp',
				'srtp',
				'rtcp',
				// 'rtx',
				// 'bwe',
				// 'score',
				// 'simulcast',
				// 'svc'
			],
		},
		// Router settings
		router: {
			mediaCodecs: [
				{
					kind: 'audio',
					mimeType: 'audio/opus',
					clockRate: 48000,
					channels: 2,
				},
				{
					kind: 'video',
					mimeType: 'video/VP8',
					clockRate: 90000,
					parameters: {
						'x-google-start-bitrate': 1000,
					},
				},
			],
		},
		// WebRtcTransport settings
		webRtcTransport: {
			listenIps: [
				{
					ip: '127.0.0.1',
					announcedIp: null,
				},
			],
			maxIncomingBitrate: 1500000,
			initialAvailableOutgoingBitrate: 1000000,
		},
	},
}

export default config
