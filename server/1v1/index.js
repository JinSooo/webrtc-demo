import Fastify from 'fastify'
import { Server } from 'socket.io'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* --------------------------------- server --------------------------------- */
const fastify = Fastify({
	logger: true,
	// https证书
	https: {
		cert: readFileSync(join(__dirname, '../lib/localhost+2.pem')),
		key: readFileSync(join(__dirname, '../lib/localhost+2-key.pem')),
	},
})
await fastify.listen({ port: 8080 })

/* -------------------------------- websocket ------------------------------- */
const io = new Server(fastify.server, { cors: true })
io.on('connection', socket => {
	console.log('a user connected')
})
