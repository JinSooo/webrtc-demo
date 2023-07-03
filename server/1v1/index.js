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
	// HTTPS 证书
	https: {
		cert: readFileSync(join(__dirname, '../lib/localhost+2.pem')),
		key: readFileSync(join(__dirname, '../lib/localhost+2-key.pem')),
	},
})

fastify.get('/', () => 'hello')

await fastify.listen({ host: '0.0.0.0', port: 8080 })

/* -------------------------------- websocket ------------------------------- */
// 信令服务器
const io = new Server(fastify.server, { cors: true })
io.on('connection', socket => {
	socket.on('join', data => {
		handleUserJoin(socket, data)
		console.log(ROOM_LIST)
	})

	socket.on('leave', data => {
		handleUserLeave(socket, data)
		console.log(ROOM_LIST)
	})

	socket.on('disconnect', data => {
		handleUserLeave(socket, data)
		console.log(ROOM_LIST)
	})

	socket.on('sdp', data => {
		console.log('sdp', data.type)
		socket.to(data.roomId).emit('sdp', data)
	})
})

const ROOM_LIST = []
const MAX_USER_COUNT = 2

const handleUserJoin = (socket, data) => {
	// 判断房间是否存在
	const filterRoom = ROOM_LIST.filter(room => room.roomId === data.roomId)[0]
	let room = null
	if (filterRoom) {
		room = filterRoom
	} else {
		room = { roomId: data.roomId, userList: [] }
		ROOM_LIST.push(room)
	}

	// 房间人数是否超过预设人数
	if (room.userList.listen >= MAX_USER_COUNT) {
		socket.emit('error', '房间人数已满，请稍后再试')
		return
	}

	// 判断用户是否已经在房间内
	const filterUser = room.userList.some(user => user.userId === data.userId)
	if (filterUser) {
		socket.emit('error', '用户已经在房间里')
		return
	}

	// 将数据保存到socket对象上
	socket.userId = data.userId
	socket.roomId = data.roomId

	// 加入房间
	room.userList.push(data)
	socket.join(data.roomId)
	// 通知房间内的其他人welcome
	socket.to(data.roomId).emit('welcome', data)
	// 通知其他用户创建offer
	// if (room.userList > 1)
	console.log(room.userList.length)
	socket.to(data.roomId).emit('sdp', { type: 'offer' })
}

const handleUserLeave = socket => {
	// 找到对应的房间和用户
	const room = ROOM_LIST.filter(room => room.roomId === socket.roomId)[0]
	if (room) {
		const user = room.userList.filter(user => user.userId === socket.userId)[0]
		if (user) {
			console.log(user.userId, '离开房间')
			// 通知房间内的其他用户
			socket.to(room.roomId).emit('leave', user)
			socket.leave()

			// 清除房间里该用户的信息
			room.userList = room.userList.filter(user => user.userId !== socket.userId)
			// 如果房间为空，删除该房间
			if (room.userList.length === 0) {
				ROOM_LIST.splice(ROOM_LIST.indexOf(room), 1)
			}
		}
	}
}
