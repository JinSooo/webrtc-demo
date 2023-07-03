import io from 'socket.io-client'

export default function Home() {
	const socket = io('ws://localhost:8080')
	console.log(socket)

	return <></>
}
