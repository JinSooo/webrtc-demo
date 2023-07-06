# Server

## 配置 HTTPS

mkcert 是一个用于生成本地自签名 SSL 证书的开源工具，项目基于 Golang 开发，可跨平台使用，不需要配置，支持多域名以及自动信任 CA。

安装 [mkcert](https://github.com/FiloSottile/mkcert) [https://github.com/FiloSottile/mkcert]

接着执行如下指令生成 HTTPS 证书

```bash
./mkcert.exe localhost 127.0.0.1 ::1
```

其中 localhost+2.pem 为 公钥， localhost+2-key.pem 为私钥

在 Fastify 中使用 HTTPS 证书

```javascript
const fastify = Fastify({
	// https证书
	https: {
		cert: readFileSync(join(__dirname, '../lib/localhost+2.pem')),
		key: readFileSync(join(__dirname, '../lib/localhost+2-key.pem')),
	},
})
```

这样就配置完成了，后面服务器就会使用 https 服务了

## Fastify 配置 ip 访问

添加 ip `0.0.0.0`

```javascript
fastify.listen({ host: '0.0.0.0', port: 8080 })
```

# 流媒体服务器

## SFC

SFU 像是一个媒体流路由器，接收终端的音视频流，根据需要转发给其他终端。SFU 在音视频会议中应用非常广泛，尤其是 WebRTC 普及以后。支持 WebRTC 多方通信的媒体服务器基本都是 SFU 结构。SFU 的拓扑机构和功能模型如下图：

![sfc](static/sfc.png)

在上图中，B1、B2、B3、B4 分别代表 4 个浏览器，每一个浏览器都会共享一路流发给 SFU，SFU 会将每一路流转发给共享者之外的 3 个浏览器。

下面这张图是从 SFU 服务器的角度展示的功能示意图：

![sfc](static/sfc1.png)

相比 MCU，SFU 在结构上显得简单很多，只是接收流然后转发给其他人。然而，这个简单结构也给音视频传输带来了很多便利。比如，SFU 可以根据终端下行网络状况做一些流控，可以根据当前带宽情况、网络延时情况，选择性地丢弃一些媒体数据，保证通信的连续性。

目前许多 SFU 实现都支持 SVC 模式和 Simulcast 模式，用于适配 WiFi、4G 等不同网络状况，以及 Phone、Pad、PC 等不同终端设备。

### Simulcast 模式

所谓 Simulcast 模式就是指视频的共享者可以同时向 SFU 发送多路不同分辨率的视频流（一般为三路，如 1080P、720P、360P）。而 SFU 可以将接收到的三路流根据各终端的情况而选择其中某一路发送出去。例如，由于 PC 端网络特别好，给 PC 端发送 1080P 分辨率的视频；而移动网络较差，就给 Phone 发送 360P 分辨率的视频。

Simulcast 模式对移动端的终端类型非常有用，它可以灵活而又智能地适应不同的网络环境。下图就是 Simulcast 模式的示意图：

![sfc](static/simulcast.png)

### SVC 模式

SVC 是可伸缩的视频编码模式。与 Simulcast 模式的同时传多路流不同，SVC 模式是在视频编码时做“手脚”。

它在视频编码时将视频分成多层——核心层、中间层和扩展层。上层依赖于底层，而且越上层越清晰，越底层越模糊。在带宽不好的情况下，可以只传输底层，即核心层，在带宽充足的情况下，可以将三层全部传输过去。

如下图所示，PC1 共享的是一路视频流，编码使用 SVC 分为三层发送给 SFU。SFU 根据接收端的情况，发现 PC2 网络状况不错，于是将 0、1、2 三层都发给 PC2；发现 Phone 网络不好，则只将 0 层发给 Phone。这样就可以适应不同的网络环境和终端类型了。

![sfc](static/svc.png)

## Medooze

Medooze 是一款综合流媒体服务器，它不仅支持 WebRTC 协议栈，还支持很多其他协议，如 RTP、RTMP 等。其源码地址为：https://github.com/medooze/media-server 。

下面我们来看一下 Medooze 的架构图：

![sfc](static/medooze.png)

从大的方面来讲，Medooze 支持 RTP/RTCP、SRTP/SRCP 等相关协议，从而可以实现与 WebRTC 终端进行互联。除此之外，Medooze 还可以接入 RTP 流、RTMP 流等，因此你可以使用 GStreamer/FFmpeg 向 Medooze 推流，这样进入到同一个房间的其他 WebRTC 终端就可以看到 / 听到由 GStream/FFmpeg 推送上来的音视频流了。另外，Medooze 还支持录制功能，即上图中的 Recorder 模块的作用，可以通过它将房间内的音视频流录制下来，以便后期回放。

为了提高多方通信的质量，Medooze 在音视频的内容上以及网络传输的质量上都做了大量优化。关于这些细节我们这里就不展开了，因为在后面的文章中我们还会对 Medooze 作进一步的讲解。

以上我们介绍的是 Medooze 的核心层，下面我们再来看看 Medooze 的控制逻辑层。Medooze 的控制逻辑层是通过 Node.js 实现的，Medooze 通过 Node.js 对外提供了完整的控制逻辑操作相关的 API，通过这些 API 你可以很容易的控制 Medooze 的行为了。

通过上面的介绍，我们可以知道 Medooze 与 Mediasoup 相比，两者在核心层实现的功能都差不多，但 Medooze 的功能更强大，包括了录制、推 RTMP 流、播放 FLV 文件等相关的操作，而 Mediasoup 则没有这些功能。

不过 Medooze 也有一些缺点，尽管 Medooze 也是 C++ 开发的流媒体服务务器，使用了异步 IO 事件处理机制，但它使用的异步 IO 事件处理的 API 是 poll，poll 在处理异步 IO 事件时，与 Linux 下最强劲的异步 IO 事件 API epoll 相比要逊色不少，这导致它在接收 / 发送音视频包时性能比 Mediasoup 要稍差一些。

### Medooze 的使用

> 注意：Medooze 只能在 Linux 或 Mac OS 中编译使用，Windows 的话，请使用 WSL

一些必要的环境自行进行配置

接着按照下面指令安装运行

```bash
# 下载 SFU 代码
git clone https://github.com/medooze/sfu.git
# 安装 SFU 依赖
cd sfu
npm install
# 生成自签名证书
openssl req -sha256 -days 3650 -newkey rsa:1024 -nodes -new -x509 -keyout server.key -out server.cert
# 启动服务
node index.js IP
```

接着我们就可以通过 `https://IP:8084/index.html`来访问 Demo 了

## Mediasoup

Mediasoup 是推出时间不长的 WebRTC 流媒体服务器开源库，其地址为：https://github.com/versatica/mediasoup/ 。

Mediasoup 由应用层和数据处理层组成。应用层是通过 Node.js 实现的；数据处理层由 C++ 语言实现，包括 DTLS 协议实现、ICE 协议实现、SRTP/SRTCP 协议实现、路由转发等。

下面我们来看一下 Mediasoup 的架构图，如下所示：

![sfc](static/mediasoup.png)

Mediasoup 把每个实例称为一个 Worker，在 Worker 内部有多个 Router，每个 Router 相当于一个房间。在每个房间里可以有多个用户或称为参与人，每个参与人在 Mediasoup 中由一个 Transport 代理。换句话说，对于房间（Router）来说，Transport 就相当于一个用户。

Transport 有三种类型，即 WebRtcTransport、PlainRtpTransport 和 PipeTransport。

WebRtcTransport 用于与 WebRTC 类型的客户端进行连接，如浏览器。
PlainRtpTransport 用于与传统的 RTP 类型的客户端连接，通过该 Transport 可以播放多媒体文件、FFmpeg 的推流等。
PipeTransport 用于 Router 之间的连接，也就是一个房间中的音视频流通过 PipeTransport 传到另一个房间。
在每个 Transport 中可以包括多个 Producer 和 Consumer。

- Producer 表示媒体流的共享者，它又分为两种类型，即音频的共享者和视频的共享者。
- Consumer 表示媒体流的消费者，它也分为两种类型，即音频的消费者和视频的消费者。
- Mediasoup 的实现逻辑非常清晰，它不关心上层应用该如何做，只关心底层数据的传输，并将它做到极致。

Mediasoup 底层使用 C++ 开发，使用 libuv 作为其异步 IO 事件处理库，所以保证了其性能的高效性。同时它支持了几乎所有 WebRTC 为了实时传输做的各种优化，所以说它是一个特别优秀的 WebRTC SFU 流媒体服务器。

所以对于想学习 WebRTC 流媒体服务器源码的同学来说，Mediasoup 是一个非常不错的项目。

另外，对于开发能力比较强的公司来说，根据自己的业务需要在 Mediasoup 上做二次开发也是非常值得推荐的技术方案。

## Mediasoup 的使用

使用的结构：

![use](static/mediasoup_use.png)

### server 端

先创建 Worker 和 Router，同时还要将 router 支持的 RTP 类型传输给 client

```javascript
const mediasoupWorker = await mediasoup.createWorker({
	logLevel: config.mediasoup.worker.logLevel,
	logTags: config.mediasoup.worker.logTags,
	rtcMinPort: config.mediasoup.worker.rtcMinPort,
	rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
})
const mediasoupRouter = await mediasoupWorker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs })

// 支持的RTP类型
mediasoupRouter.rtpCapabilities
```

后面都是两端相互联动创建连接，创建 WebRtcTransport

```javascript
const transport = await mediasoupRouter.createWebRtcTransport(option)
return {
	transport,
	params: {
		id: transport.id,
		iceParameters: transport.iceParameters,
		iceCandidates: transport.iceCandidates,
		dtlsParameters: transport.dtlsParameters,
	},
}
```

注意返回值，transport 是一个 WebRtcTransport 实例，用于与客户端的 transport 建立连接，以便后续流媒体的传输

transport 的实例需要保存，而 params 参数是传输给客户端，这样客户端就知道服务器创建了的 transport，就可以将两个 transport 建立连接了

接下来是 producer ，用于将客户端的音视频传输通过 transport 传输给 mediasoup 服务器

> 注意一个 producer 只对应与一种流媒体类型，即要么音频，要么视频

当 client 调用 produce()方法后，服务端创建 producer 来接受它的数据并传入给 router，用于后面 consumer 分配

服务端创建 producer

```javascript
// kind: audio / video
const producer = await producerTransport.produce({ kind, rtpParameters })
```

最后是 consumer， 用于将客户端传输给 mediasoup 服务器 的数据发送给客户端

当 client 调用 consume()方法后，指定要接受数据的 producer 的 id，服务端创建 consumer 来接受它的数据并传入给 client

```javascript
const consumer = await consumerTransport.consume({
	producerId: producer.id,
	rtpCapabilities,
	paused: producer.kind === 'video',
})
```

### client 端

首先加载 device 数据，查看服务器支持的类型

```javascript
const device = new mediasoup.Device()
// 使用mediasoup路由器的RTP功能加载设备
await device.load({ routerRtpCapabilities })
```

接着创建 Send Transport，用于将自己的音视频传输给服务器

创建的同时，服务器也创建对应 transport，并与之建立连接

```javascript
// 创建一个新的webbrtc传输来发送媒体。传输必须事先通过router.createwebrtctransport()在mediasoup路由器中创建
const transport = device.createSendTransport(data)
```

接下来，我们就可以通过 produce()方法将本地音视频传输给服务器的 producer 了

```javascript
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
const track = stream.getVideoTracks()[0]
await transport.produce({ track })
```

最后建立上连接之后，就可以把 stream 传给 video 了

consume() 是一样的，先创建 Recv Transport，并建立 transport 的连接

```javascript
const transport = device.createRecvTransport(data)
```

接着通过 consume()，接收到对应的 producer 的流媒体，再获取到音视频 track 就可以传输到 video 中了

### FIX BUG: 手机端无法正常连接到 mediasoup

修改 `config.js`

```javascript
{
  // ...
  webRtcTransport: {
			listenIps: [
				{
					// '192.168.1.12'是内网IP，不能填0.0.0.0，在本机测试部署的时候也不能填127.0.0.1
					ip: '192.168.1.12',
				},
			],
		},
}
```

# 流媒体协议

## RTMP

RTMP，全称 Real Time Messaging Protocol ，即实时消息协议。但它实际上并不能做到真正的实时，一般情况最少都会有几秒到几十秒的延迟，底层是基于 TCP 协议的。

RTMP 的传输格式为 RTMP Chunk Format，媒体流数据的传输和 RTMP 控制消息的传输都是基于此格式的。

需要注意的是，在使用 RTMP 协议传输数据之前，RTMP 也像 TCP 协议一样，先进行三次握手才能将连接建立起来。当 RTMP 连接建立起来后，你可以通过 RTMP 协议的控制消息为通信的双方设置传输窗口的大小（缓冲区大小）、传输数据块的大小等。

### 优势

RTMP 协议在苹果公司宣布其产品不支持 RTMP 协议，且推出 HLS 技术来替代 RTMP 协议的“打压”下，已停止更新。但协议停止更新后，这么多年仍然屹立不倒，说明该协议肯定有它独特的优势。那有哪些呢？

- RTMP 协议底层依赖于 TCP 协议，不会出现丢包、乱序等问题，因此音视频业务质量有很好的保障。
- 使用简单，技术成熟。有现成的 RTMP 协议库实现，如 FFmpeg 项目中的 librtmp 库，用户使用起来非常方便。而且 RTMP 协议在直播领域应用多年，技术已经相当成熟。
- 市场占有率高。在日常的工作或生活中，我们或多或少都会用到 RTMP 协议。如常用的 FLV 文件，实际上就是在 RTMP 消息数据的最前面加了 FLV 文件头。
- 相较于 HLS 协议，它的实时性要高很多。

### 劣势

RTMP 有优势，也有劣势。在 RTMP 的众多劣势中，我认为最为关键的有两条。

- 苹果公司的 iOS 不支持 RTMP 协议，按苹果官方的说法， RTMP 协议在安全方面有重要缺陷。
- 在苹果的公司的压力下，Adobe 已经停止对 RTMP 协议的更新了。

## HLS

HLS，全称 HTTP Live Streaming，是苹果公司实现的基于 HTTP 的流媒体传输协议。它可以支持流媒体的直播和点播，主要应用在 iOS 系统和 HTML5 网页播放器中。

HLS 的基本原理非常简单，它是将多媒体文件或直接流进行切片，形成一堆的 ts 文件和 m3u8 索引文件并保存到磁盘。

当播放器获取 HLS 流时，它首先根据时间戳，通过 HTTP 服务，从 m3u8 索引文件获取最新的 ts 视频文件切片地址，然后再通过 HTTP 协议将它们下载并缓存起来。当播放器播放 HLS 流时，播放线程会从缓冲区中读出数据并进行播放。

通过上面的描述我们可以知道，HLS 协议的本质就是通过 HTTP 下载文件，然后将下载的切片缓存起来。由于切片文件都非常小，所以可以实现边下载边播的效果。HLS 规范规定，播放器至少下载一个 ts 切片才能播放，所以 HLS 理论上至少会有一个切片的延迟。

### 优势

HLS 是为了解决 RTMP 协议中存在的一些问题而设计的，所以，它自然有自己的优势。主要体现在以下几方面：

- RTMP 协议没有使用标准的 HTTP 接口传输数据，在一些有访问限制的网络环境下，比如企业网防火墙，是没法访问外网的，因为企业内部一般只允许 80/443 端口可以访问外网。而 HLS 使用的是 HTTP 协议传输数据，所以 HLS 协议天然就解决了这个问题。
- HLS 协议本身实现了码率自适应，不同带宽的设备可以自动切换到最适合自己码率的视频进行播放。
- 浏览器天然支持 HLS 协议，而 RTMP 协议需要安装 Flash 插件才能播放 RTMP 流。

### 不足

HLS 最主要的问题就是实时性差。由于 HLS 往往采用 10s 的切片，所以最小也要有 10s 的延迟，一般是 20 ～ 30s 的延迟，有时甚至更差。

HLS 之所以能达到 20 ～ 30s 的延迟，主要是由于 HLS 的实现机制造成的。HLS 使用的是 HTTP 短连接，且 HTTP 是基于 TCP 的，所以这就意味着 HLS 需要不断地与服务器建立连接。TCP 每次建立连接时都要进行三次握手，而断开连接时，也要进行四次挥手，基于以上这些复杂的原因，就造成了 HLS 延迟比较久的局面。

## FLV

FLV 文件是一个流式的文件格式。该文件中的数据部分是由多个 “PreviousTagSize + Tag”组成的。这样的文件结构有一个天然的好处，就是你可以将音视频数据随时添加到 FLV 文件的末尾，而不会破坏文件的整体结构。

在众多的媒体文件格式中，只有 FLV 具有这样的特点。像 MP4、MOV 等媒体文件格式都是结构化的，也就是说音频数据与视频数据是单独存放的。当服务端接收到音视频数据后，如果不通过 MP4 的文件头，你根本就找不到音频或视频数据存放的位置。

正是由于 FLV 是流式的文件格式，所以它特别适合在音视频录制中使用。

使用 FLV 进行视频回放也特别方便，将生成好的 FLV 直接推送到 CDN 云服务，在 CDN 云服务会将 FLV 文件转成 HLS 切片，这样用户就可以根据自己的终端选择使用 FLV 或 HLS 协议回放录制好的视频。

而对于回放实时性要求比较高的业务，还可以将 FLV 按 3 ～ 5 分钟进行切片，这样就可以在直播几分钟后看到录制好的内容了。

另外，FLV 相较 MP4 等多媒体文件，它的文件头是固定的，音视频数据可以随着时间的推移随时写入到文件的末尾；而 MP4 之类的文件，文件头是随着数据的增长而增长的，并且体积大，处理时间长。因此， FLV 文件相较于其他多媒体文件特别适合于在录制中使用。

## CDN 网络

CDN 网络的构造十分复杂，一般情况下，它先在各运营商内构建云服务，然后再将不同运营商的云服务通过光纤连接起来，从而实现跨运营商的全网 CDN 云服务。

而每个运营商云服务内部包括了多个节点，按功能分为 3 类。

- 源节点，用于接收用户推送的媒体流。
- 主干结点，起到媒体数据快速传递的作用，比如与其他运营商传送媒体流。
- 过缘节点，用于用户来主动接流。一般边缘节点的数量众多，但机子的性能比较低，它会被布署到各地级市，主要解决网络最后一公里的问题。

接下来，我们简要描述一下 CDN 网络的处理流程。

当一个主播想将自己的音视频共享出去的时候，首先通过直播系统的信令服务器获取到可以推送媒体流的 CDN 源节点。CDN 网络从源节点接收到媒体数据后，会主动向各个主干结点传送流媒体数据，这样主干结点就将媒体数据缓存起来了。当然这个缓冲区的大小是有限的，随着时间流逝，缓冲区中的数据也在不断更替中。

当有观众想看某个主播的节目时，会从直播系统的信令服务器获取离自己最近的 CDN 边缘节点，然后到这个边缘节点去拉流。由于他是第一个在该节点拉流的用户，因此该 CDN 边缘节点还没有用户想到的媒体流，怎么办呢？那就向主干结点发送请求。主干结点收到请求后，从自己的缓冲区中取出数据流源源不断地发给边缘节点，这时边缘节点再将媒体数据发给观众。

当第二个观众再次到该 CDN 边缘节点接流时，该节点发现该流已经在自己的缓存里了，就不再向主干结点请求，直接将媒体流下发下去了。因此，观众在使用 CDN 网络时会发现，第一个观众在接流时需要花很长时间才能将流拉下来，可是后来的用户很快就将流拉下来进行播放了。

# SRS

> https://github.com/ossrs/srs

SRS 是一个简单高效的实时视频服务器，支持 RTMP/WebRTC/HLS/HTTP-FLV/SRT/GB28181。

TODO: 到时候可以去体验一些，目前先用 meidasoup
