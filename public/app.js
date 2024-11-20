document.addEventListener("DOMContentLoaded", function () {

  const formContainer = document.getElementById("form-container");
  const videoContainer = document.getElementById("video-container");
  const fullScreenVideo = document.getElementById("fullScreenVideo");
  const smallScreenVideo = document.getElementById("smallVideo");
  const localVideoContainer = document.getElementById("local-video");
  const startBtn = document.getElementById("startBtn");
  const startStopVideo = document.getElementById("startStopVideo");
  const flipCamera = document.getElementById("flipCamera");
  const screenShare = document.getElementById("screenShare");
  const muteUnmute = document.getElementById("muteUnmute");
  const endCall = document.getElementById("endCall");
  const controlsWrapper = document.querySelector(".controls-wrapper");
  const buttons = document.querySelector(".controls");
  let localStream;
  let currentVideoTrack = null; // Track the current video track
  let currentAudioTrack = null;

  // Show controls on mouse enter
  controlsWrapper.addEventListener("mouseenter", () => {
    buttons.style.display = "flex";
  });

  // Hide controls on mouse leave
  controlsWrapper.addEventListener("mouseleave", () => {
    buttons.style.display = "none";
  });

  async function startCall() {
    // Fade out the form container
    formContainer.style.transition = "opacity 1s ease";
    formContainer.style.opacity = "0.3";

    // Get the values of the input fields
    let gender = document.getElementById("gender").value;
    let age = document.getElementById("age").value;
    let interests = (document.getElementById("interests").value).split(',');

    try {
      age = parseInt(age.trim());
      if (18 > age || age > 100 || isNaN(age)) {
        age = 0;
      }
    }
    catch {
      age = 0;
    }

    stripped_interests = [];
    for (let i = 0; i < interests.length; i++) {
      stripped_interests.push(interests[i].trim().toLowerCase());
    }

    // fullscreen local video
    localVideoContainer.style.height = "100%";
    localVideoContainer.style.width = "100%";

    formContainer.style.display = "none";
    videoContainer.style.display = "block"; // Assuming you want it to display as flex

    const startMyVideo = async () => {
      try {
        const constraints = { video: { facingMode: "user" }, audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        localStream = stream;
        smallScreenVideo.srcObject = stream;
        createOffer();
      } catch (error) { }
    };

    startMyVideo();

    const socket = io("https://callvibeatgmpire.onrender.com:80");

    // Single Method for peer connection
    const PeerConnection = (function () {
      let peerConnection;
      const createPeerConnection = () => {
        const config = {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
          ],
        };
        peerConnection = new RTCPeerConnection(config);

        // add local stream to peer connection
        localStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStream);
        });
        // listen to remote stream and add to peer connection
        peerConnection.ontrack = function (event) {
          fullScreenVideo.srcObject = event.streams[0];
        };
        // listen for ice candidate
        peerConnection.onicecandidate = function (event) {
          if (event.candidate) {
            socket.emit("icecandidate", event.candidate);
          }
        };

        return peerConnection;
      };

      return {
        getInstance: () => {
          if (!peerConnection) {
            peerConnection = createPeerConnection();
          }
          return peerConnection;
        },
      };
    })();

    async function createOffer() {
      // start call
      const pc = PeerConnection.getInstance();

      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);
      socket.emit("offer", {
        offer: pc.localDescription,
        gender,
        age,
        interests: stripped_interests
      });
    }

    socket.on("offer", async ({ offer, offer_came_from, message }) => {
      if (message) { }
      const pc = PeerConnection.getInstance();
      // set remote description
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", { answer_sent_to: offer_came_from, answer: pc.localDescription });
    });

    socket.on("answer", async ({ answer }) => {
      const pc = PeerConnection.getInstance();
      await pc.setRemoteDescription(answer);
    });

    socket.on("icecandidate", async (candidate) => {
      const pc = PeerConnection.getInstance();
      await pc.addIceCandidate(new RTCIceCandidate(candidate));

      // restore local video to original size
      localVideoContainer.style.height = "25%";
      localVideoContainer.style.width = "25%";
      localVideoContainer.style.bottom = "1rem";
      localVideoContainer.style.right = "1rem";
      controlsWrapper.style.display = "block";
    });

    socket.on("noUserAvailable", (data) => {
      const pc = PeerConnection.getInstance();
      // Reset UI elements
      videoContainer.style.display = "none";
      formContainer.style.display = "flex";
      formContainer.style.opacity = "1.0";
    });

    // Listen for the 'endCall' event from the server
    socket.on("endCall", () => {
      const pc = PeerConnection.getInstance();
      if (pc) {
        pc.close(); // Close the peer connection
      }
      // Reset UI elements
      videoContainer.style.display = "none";
      formContainer.style.display = "flex";
      formContainer.style.opacity = "1.0";
    });

    function toggleVideo() {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled; // Disable the audio track (mute)
      }
      if (document.querySelector('#startStopVideo>img').getAttribute('src') === 'no-video.png') {
        document.querySelector('#startStopVideo>img').setAttribute('src', 'video-camera.png');
      }
      else {
        document.querySelector('#startStopVideo>img').setAttribute('src', 'no-video.png');
      }
    }

    async function toggleCameraFacing() {
      if (!localStream) return;

      const audioTrack = localStream.getAudioTracks()[0];
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrackContraints = audioTrack.getConstraints();
      const currentVideoConstraints = videoTrack.getConstraints();

      // Toggle facingMode between 'user' (front camera) and 'environment' (back camera)
      const newFacingMode =
        currentVideoConstraints.facingMode === "user" ? "environment" : "user";
      // Stop the current video track
      localStream.getTracks().forEach((track) => track.stop());

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: audioTrackContraints,
      });
      // Update the video element and stream
      smallScreenVideo.srcObject = newStream;
    }

    async function toggleScreenShare() {
      try {
        const peerConnection = PeerConnection.getInstance();
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true, // Request audio for screen share
        });

        const screenVideoTrack = screenStream.getVideoTracks()[0];
        const screenAudioTrack = screenStream.getAudioTracks()[0];

        // Replace the video track in the peer connection
        const videoSender = peerConnection
          .getSenders()
          .find((s) => s.track.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(screenVideoTrack);
        }

        // Replace the audio track in the peer connection
        const audioSender = peerConnection
          .getSenders()
          .find((s) => s.track.kind === "audio");
        if (audioSender) {
          await audioSender.replaceTrack(screenAudioTrack);
        }

        // Update the local stream with the new tracks
        if (currentVideoTrack) {
          localStream.removeTrack(currentVideoTrack);
          localStream.addTrack(screenVideoTrack);
        }

        if (currentAudioTrack) {
          localStream.removeTrack(currentAudioTrack);
          localStream.addTrack(screenAudioTrack);
        }

        // Update the video element to show the screen share stream
        smallScreenVideo.srcObject = screenStream;

        currentVideoTrack = screenVideoTrack; // Set screen video track as current track
        currentAudioTrack = screenAudioTrack; // Set screen audio track as current track

        screenVideoTrack.onended = async () => {
          try {
            const localStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "user" },
              audio: true,
            });

            const localVideoTrack = localStream.getVideoTracks()[0];
            const localAudioTrack = localStream.getAudioTracks()[0];

            // Restore original camera feed and update remote peer
            if (videoSender) {
              await videoSender.replaceTrack(localVideoTrack);
            }
            if (audioSender) {
              await audioSender.replaceTrack(localAudioTrack);
            }

            // Show the local video again
            smallScreenVideo.srcObject = localStream;
          } catch (error) {
            console.error("Error restoring camera: ", error);
          }
        };
      } catch (error) { }
      if (document.querySelector('#screenShare>img').getAttribute('src') === 'share-screen.png') {
        document.querySelector('#screenShare>img').setAttribute('src', 'no-screen.png');
      }
      else {
        document.querySelector('#screenShare>img').setAttribute('src', 'share-screen.png');
      }
    }

    function toggleAudio() {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled; // Enable/Disable the audio track (mute)
      }
      if (document.querySelector('#muteUnmute>img').getAttribute('src') === 'mute.png') {
        document.querySelector('#muteUnmute>img').setAttribute('src', 'volume.png');
      }
      else {
        document.querySelector('#muteUnmute>img').setAttribute('src', 'mute.png');
      }
    }

    function terminateCall() {
      const pc = PeerConnection.getInstance();
      pc.close();

      // Notify the server to end the call
      socket.emit("endCall");

      videoContainer.style.display = "none";
      formContainer.style.display = "flex";
      formContainer.style.opacity = "1.0";
    }

    startStopVideo.addEventListener("click", toggleVideo);

    flipCamera.addEventListener("click", toggleCameraFacing);

    screenShare.addEventListener("click", toggleScreenShare);

    muteUnmute.addEventListener("click", toggleAudio);

    endCall.addEventListener("click", terminateCall);
  }

  // Attach the function to the start button
  startBtn.addEventListener("click", startCall);
});
