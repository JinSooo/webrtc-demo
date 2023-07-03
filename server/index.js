import Fastify from 'fastify'
import { Server } from 'socket.io'

const fastify = Fastify({
	logger: true,
})
const io = new Server(fastify.server)

await fastify.listen({ port: 8080 })

io.on('connection', socket => {
	console.log('a user connected')
})
