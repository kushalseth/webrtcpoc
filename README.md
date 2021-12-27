See http://webrtc.org for details.


basic Steps:

// client 1

const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

const localConnection = new RTCPeerConnection();
const sendChannel = localConnection.createDataChannel("sendChannel"); 

sendChannel.onmessage =e =>  console.log("messsage received!!!"  + e.data );
sendChannel.onopen = e => console.log("open!!!!");



localConnection.onicecandidate = e =>  
console.log(" NEW ice candidnat!! on localconnection reprinting SDP " +  
JSON.stringify(localConnection.localDescription))



localConnection.createOffer().then(o => localConnection.setLocalDescription(o) )



     sendChannel.onclose =e => console.log("closed!!!!!!");








client B

//set offer const offer = ...

const offer = {"type":"offer","sdp":"v=0\r\no=- 8076175355948253363 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 60630 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 10.254.88.22\r\na=candidate:3554716052 1 udp 2122260223 10.254.88.22 60630 typ host generation 0 network-id 2\r\na=candidate:1270274445 1 udp 2122194687 192.168.1.11 60631 typ host generation 0 network-id 1 network-cost 10\r\na=candidate:2640532836 1 tcp 1518280447 10.254.88.22 9 typ host tcptype active generation 0 network-id 2\r\na=candidate:87369085 1 tcp 1518214911 192.168.1.11 9 typ host tcptype active generation 0 network-id 1 network-cost 10\r\na=ice-ufrag:oPZ8\r\na=ice-pwd:bjfWvcrGFtlwo5kXJOZIPPe4\r\na=ice-options:trickle\r\na=fingerprint:sha-256 F3:FF:91:8D:30:E3:1E:25:82:46:26:61:1F:F8:AA:EF:DC:3A:B0:A1:A4:FD:7D:2D:38:1D:8A:3E:4B:3E:FB:B1\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n"}

const remoteConnection = new RTCPeerConnection()

remoteConnection.onicecandidate = e =>  {
console.log(" NEW ice candidnat!! on localconnection reprinting SDP " )
 console.log(JSON.stringify(remoteConnection.localDescription) )
}

 
remoteConnection.ondatachannel= e => {

      const receiveChannel = e.channel;
      receiveChannel.onmessage =e =>  console.log("messsage received!!!"  + e.data )
      receiveChannel.onopen = e => console.log("open!!!!");
      receiveChannel.onclose =e => console.log("closed!!!!!!");
      remoteConnection.channel = receiveChannel;

}


remoteConnection.setRemoteDescription(offer).then(a=>console.log("done"))

//create answer
await remoteConnection.createAnswer().then(a => remoteConnection.setLocalDescription(a)).then(a=>
console.log(JSON.stringify(remoteConnection.localDescription)))
//send the anser to the client 	


client A

const answer = {"type":"answer","sdp":"v=0\r\no=- 6972796941086353903 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 60953 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 10.254.88.22\r\na=candidate:3554716052 1 udp 2122260223 10.254.88.22 60953 typ host generation 0 network-id 2\r\na=candidate:1270274445 1 udp 2122194687 192.168.1.11 60954 typ host generation 0 network-id 1 network-cost 10\r\na=candidate:2640532836 1 tcp 1518280447 10.254.88.22 9 typ host tcptype active generation 0 network-id 2\r\na=candidate:87369085 1 tcp 1518214911 192.168.1.11 9 typ host tcptype active generation 0 network-id 1 network-cost 10\r\na=ice-ufrag:hhn5\r\na=ice-pwd:GQVXZ7GAZUu/1+Mik/HEXoHX\r\na=ice-options:trickle\r\na=fingerprint:sha-256 4A:54:1A:43:EA:9B:B5:B5:EA:0C:E5:2A:1D:08:69:80:0F:86:75:C4:AB:2D:17:5F:A8:FC:08:5D:87:AE:CE:1D\r\na=setup:active\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n"}


localConnection.setRemoteDescription (answer).then(a=>console.log("done"))


ICE Connection Restart
https://github.com/feross/simple-peer/issues/579

Local
firebase serve --only hosting