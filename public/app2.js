mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

const configuration = {
  iceServers: [
    {
      /*urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],*/
      urls: [
        'stun:stun.services.mozilla.com'
      ]
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;
// messaging variables
let connected = false;
let localChannel = "";
let remoteChannel = "";
let remoteMessages = "";
let localMessages = "";

let _applicationStates = {
    newMeeting: "newMeeting"
}

function init() {
  document.querySelector('#cameraBtn').addEventListener('click', openUserMedia);
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  document.querySelector('#joinBtn').addEventListener('click', joinRoom);
  document.querySelector('#startLiveChatBtn').addEventListener('click', _startLiveChatBtn);
  document.querySelector('#joinLiveChatBtn').addEventListener('click', _joinLiveChatBtn);
  document.querySelector('#enableLocalVideoBtn').addEventListener('click', _enableLocalVideoBtn);
  document.querySelector('#enableRemoteVideoBtn').addEventListener('click', _enableRemoteVideoBtn);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));

  if(window.location.pathname.length > 1) {
    // callee
    hideInitialControlsForCallee();
    if(window.location.search.length > 1) {
        document.getElementById("startLiveChatBtn").style.display = "none";
        document.getElementById("joinBtn").style.display = "none";
        document.querySelector(
            '#currentRoom').innerHTML = `<span> Want to Join the Chat? Please click Join Live Chat. </span>`;
        document.getElementById("snapbar").style.display = "block"; 
          
        document.getElementById("videos").style.display = "none";
        document.getElementById("remoteVideo").style.display = "none";      
        document.getElementById("joinLiveChatBtn").style.display = "inline";   
        document.querySelector('#cameraBtn').disabled = true;     
        //joinRoom();  
    }
    else {
        openUserMedia(null, true);
    }

  }
  else {
    // caller
    hideInitialControlsForCaller();
  }
}

async function createRoom(onlyChat) {
   
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = false;
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  // Start Messaging for Caller
  const dataChannelParams = {ordered: true};
  localChannel = peerConnection.createDataChannel('messaging-channel', dataChannelParams);
  localChannel.binaryType = 'arraybuffer';
  localChannel.addEventListener('open', () => {
    console.log('Local channel open!');
    connected = true;
  });
  localChannel.addEventListener('close', () => {
    console.log('Local channel closed!');
    connected = false;
  });
  localChannel.addEventListener('message', (event) => {
    console.log(`Remote message received by local: ${event.data}`);

    var p = document.createElement("p");
    p.style.textAlign = "left";
    p.style.paddingLeft = "10px";
    p.innerHTML = `<strong style="padding-right: 10px;"> GUEST: </strong>` + event.data;
    //p.innerHTML = event.data;
    document.getElementById("chatResults").appendChild(p)

    localMessages += event.data + '\n';
  });

  document.querySelector('#localBtn').
    addEventListener('click', async () => {
      let localMessage = document.querySelector('#localMessage').value;

      var p = document.createElement("p");
      p.style.textAlign = "right";
      p.style.paddingRight = "10px";
      p.innerHTML = localMessage;
      document.getElementById("chatResults").appendChild(p);

      document.querySelector('#localMessage').value = "";

      localChannel.send(localMessage);
    });

  // End Messaging for Caller

  registerPeerConnectionListeners();

  if(localStream) {
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
  }


  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection('callerCandidates');

  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    console.log('Got candidate: ', event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Code for creating a room below
  const offer = await peerConnection.createOffer({iceRestart: true});
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer:', offer);

  const roomWithOffer = {
    'offer': {
      type: offer.type,
      sdp: offer.sdp,
    },
  };
  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);

  document.getElementById("snapbar").style.display = "block";

  let meeting_link = window.location.href + roomRef.id;

  if(onlyChat) {
    meeting_link = meeting_link + "?c"
  }

  document.querySelector(
      '#currentRoom').innerHTML = `<span> Your meeting is ready. Share this link with others. </span> &nbsp; &nbsp; <a href=${meeting_link} target="_blank" style="font-style: italic;"
      ><strong> ${meeting_link}</strong></a>`;
  // Code for creating a room above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log('Got remote description: ', data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      enableAllVideos();
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  // Listen for remote ICE candidates above
}

async function joinRoom() {
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;

  if(window.location.pathname.length > 1) {
    let roomId = window.location.pathname.substring(1);
    console.log('Join room: ', roomId);
    
    await joinRoomById(roomId);    
  }
  else {
    // open dialog box
    document.querySelector('#confirmJoinBtn').
    addEventListener('click', async () => {
      roomId = document.querySelector('#room-id').value;
      console.log('Join room: ', roomId);
      document.querySelector(
          '#currentRoom').innerText = `Current room is ${roomId} - You are the callee!`;
      await joinRoomById(roomId);
    }, {once: true});
    roomDialog.open();
  }


}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    if(localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
          });
    }

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
    peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        console.log('Got final candidate!');
        return;
      }
      console.log('Got candidate: ', event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above



    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    console.log('Got offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log('Created answer:', answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
    // Code for creating SDP answer above

    // Listening for remote ICE candidates below
    roomRef.collection('callerCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listening for remote ICE candidates above

    // Start Messaging for Callee
    peerConnection.addEventListener('datachannel', (event) => {
      console.log(`onRemoteDataChannel: ${JSON.stringify(event)}`);
      remoteChannel = event.channel;
      remoteChannel.binaryType = 'arraybuffer';
      remoteChannel.addEventListener('message', (event) => {
        console.log(`Local message received by remote: ${event.data}`);

        var p = document.createElement("p");
        p.style.textAlign = "left";
        p.style.paddingLeft = "10px";
        p.innerHTML = `<strong style="padding-right: 10px;"> HOST: </strong>` + event.data;
        document.getElementById("chatResults").appendChild(p);
        
        remoteMessages += event.data + '\n';
      });
      remoteChannel.addEventListener('close', () => {
        console.log('Remote channel closed!');
        connected = false;
      });
    });

    document.querySelector('#remoteBtn').
    addEventListener('click', async () => {
      let remoteMessage = document.querySelector('#remoteMessage').value;

      var p = document.createElement("p");
      p.style.textAlign = "right";
      p.style.paddingRight = "10px";
      p.innerHTML = remoteMessage;
      document.getElementById("chatResults").appendChild(p);

      document.querySelector('#remoteMessage').value = "";

      remoteChannel.send(remoteMessage);
    });

    // End Messaging for Callee

  }
}

async function openUserMedia(e, isCallee, onlyChat) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);

  if(!isCallee) {
    // code for caller
    document.querySelector('#cameraBtn').disabled = true;
    document.querySelector('#joinBtn').disabled = false;
    document.querySelector('#createBtn').disabled = false;
    document.querySelector('#hangupBtn').disabled = false;
    document.getElementById("hangupBtn").style.display = "inline";
    document.getElementById("createBtn").style.display = "none"; 
    document.getElementById("videos").style.display = "block";
    document.getElementById("remoteVideo").style.display = "none";
    document.querySelector('#startLiveChatBtn').disabled = true;
    if(!onlyChat) {
        createRoom();
    }
  }
  else {
    // code for callee
    document.querySelector('#cameraBtn').disabled = true;
    document.querySelector('#joinBtn').disabled = false;
    document.querySelector('#createBtn').disabled = true;
    document.querySelector('#hangupBtn').disabled = false;
    
    document.getElementById("cameraBtn").style.display = "none";
    document.getElementById("hangupBtn").style.display = "inline";
    document.getElementById("createBtn").style.display = "none"; 
    document.getElementById("videos").style.display = "block";
    document.getElementById("remoteVideo").style.display = "none";
    
    if(!onlyChat) {
        document.getElementById("joinLiveChatBtn").style.display = "none";  
    }

    document.querySelector(
      '#currentRoom').innerHTML = `<span> Ready to Join? Check Your Audio and Video. </span>`;
    document.getElementById("snapbar").style.display = "block";    
  }


}

async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#cameraBtn').disabled = false;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';
  document.getElementById("snapbar").style.display = "none";

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {

    if(peerConnection.connectionState == "connected") {
      enableAllVideos();
      if(window.location.pathname.length > 1) {
        document.querySelector(
          '#currentRoom').innerHTML = `<span> You have Joined the Meeting. </span>`;

        if(!(window.location.search.length > 1)) {
            document.getElementById("remoteMessageSection").style.display = "block";  
            document.getElementById("localMessageSection").style.display = "none"; 
        }
 
      }
      else {
        document.getElementById("remoteMessageSection").style.display = "none";  
        document.getElementById("localMessageSection").style.display = "block";          
      }
    }
    else if(peerConnection.connectionState == "failed") {
      if(window.location.pathname.length > 1) {
        document.querySelector(
          '#currentRoom').innerHTML = `<span> Connection Failed, either meeting is ended by the HOST. or try to rejoin the meeting. </span>`;
      }      
    }
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

function hideInitialControlsForCaller() {
  document.getElementById("videos").style.display = "none";
  document.getElementById("createBtn").style.display = "none";
  document.getElementById("joinBtn").style.display = "none";
  document.getElementById("hangupBtn").style.display = "none";
  document.getElementById("snapbar").style.display = "none";
  document.getElementById("messageBox").style.display = "none";
  document.getElementById("joinLiveChatBtn").style.display = "none";
  document.getElementById("enableRemoteVideoBtn").style.display = "none";
  document.getElementById("enableLocalVideoBtn").style.display = "none";
  
}

function hideInitialControlsForCallee() {
  document.getElementById("videos").style.display = "none";
  document.getElementById("createBtn").style.display = "none";
  document.getElementById("joinBtn").style.display = "inline";
  document.getElementById("hangupBtn").style.display = "none";
  document.getElementById("snapbar").style.display = "none";
  document.getElementById("messageBox").style.display = "none";
  document.getElementById("startLiveChatBtn").style.display = "none";
  document.getElementById("enableRemoteVideoBtn").style.display = "none";
  document.getElementById("enableLocalVideoBtn").style.display = "none";
}

function enableAllVideos() {
    if(localStream) {
        document.getElementById("videos").style.display = "flex";
        document.getElementById("remoteVideo").style.display = "flex";
        document.getElementById("messageBox").style.display = "block";            
    }
}

async function _startLiveChatBtn() {
    await createRoom(true);
    document.getElementById("messageBox").style.display = "block";
    document.getElementById("localMessageSection").style.display = "block";
    document.getElementById("remoteMessageSection").style.display = "none";
    document.getElementById("joinLiveChatBtn").style.display = "none";   
    document.getElementById("cameraBtn").style.display = "none";   
    document.getElementById("enableLocalVideoBtn").style.display = "inline";  
    document.getElementById("enableRemoteVideoBtn").style.display = "none";   
    document.querySelector('#cameraBtn').disabled = true;
    document.querySelector('#startLiveChatBtn').disabled = true;    
}

async function _joinLiveChatBtn() {    
    
    document.getElementById("messageBox").style.display = "block";
    document.getElementById("localMessageSection").style.display = "none";
    document.getElementById("remoteMessageSection").style.display = "block";  
    document.querySelector('#joinLiveChatBtn').disabled = true;
    document.getElementById("cameraBtn").style.display = "none";
    document.getElementById("enableRemoteVideoBtn").style.display = "inline";
    document.getElementById("enableLocalVideoBtn").style.display = "none";       
    document.getElementById("videos").style.display = "none";
    document.getElementById("remoteVideo").style.display = "none"; 
    await joinRoom();    
}

async function _enableRemoteVideoBtn() {
    await openUserMedia(null, true);
    //await joinRoom();
    //_enableLocalVideoBtn();
    document.querySelector('#enableRemoteVideoBtn').disabled = true;
    document.getElementById("joinBtn").style.display = "inline"; 
}

async function _enableLocalVideoBtn() {
    await openUserMedia(null, false, true);
    if(localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
          });

          peerConnection.addEventListener('track', event => {
            console.log('Got remote track:', event.streams[0]);
            event.streams[0].getTracks().forEach(track => {
              console.log('Add a track to the remoteStream:', track);
              remoteStream.addTrack(track);
            });
          });  
    }
    else {
        console.error("check the issue with localstream");
    }
    document.querySelector('#enableLocalVideoBtn').disabled = true;
    
}

function _handleControls(applicationStates) {
   switch(applicationStates) {
       case _applicationStates.newMeeting:
           break;
       default:
           break;    
   }
}

function _connect() {

}

function _newMeeting() {

}

function createRoomStream() {

}


init();