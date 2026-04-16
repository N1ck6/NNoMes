// ============================================
// P2P File Transfer MVP - Main Entry Point
// Serverless WebRTC with manual SDP exchange
// Optimized for Android Chrome on Local Network
// ============================================

import { PeerConnection } from './peer.js';
import { FileStreamer } from './streamer.js';
import { ProgressTracker } from './progress.js';

// DOM Elements
const roleScreen = document.getElementById('role-screen');
const senderScreen = document.getElementById('sender-screen');
const receiverScreen = document.getElementById('receiver-screen');
const fileInput = document.getElementById('file-input');

// Sender elements
const btnSelectFile = document.getElementById('btn-select-file');
const senderWaiting = document.getElementById('sender-waiting');
const senderTransfer = document.getElementById('sender-transfer');
const senderOffer = document.getElementById('sender-offer');
const senderAnswerInput = document.getElementById('sender-answer-input');
const btnConnectSender = document.getElementById('btn-connect-sender');
const senderLog = document.getElementById('sender-log');
const senderFileInfo = document.getElementById('sender-file-info');
const senderProgress = document.getElementById('sender-progress');
const senderSpeed = document.getElementById('sender-speed');
const senderEta = document.getElementById('sender-eta');
const senderCancel = document.getElementById('sender-cancel');

// Receiver elements
const receiverConnect = document.getElementById('receiver-connect');
const receiverTransfer = document.getElementById('receiver-transfer');
const receiverOfferInput = document.getElementById('receiver-offer-input');
const btnGenerateAnswer = document.getElementById('btn-generate-answer');
const receiverAnswerStep = document.getElementById('receiver-answer-step');
const receiverAnswer = document.getElementById('receiver-answer');
const receiverLog = document.getElementById('receiver-log');
const receiverFileInfo = document.getElementById('receiver-file-info');
const receiverProgress = document.getElementById('receiver-progress');
const receiverSpeed = document.getElementById('receiver-speed');
const receiverEta = document.getElementById('receiver-eta');
const receiverStatus = document.getElementById('receiver-status');

// State
let peer = null;
let streamer = null;
let progressTracker = null;
let currentFile = null;

// Log helper
function log(element, msg) {
  const time = new Date().toLocaleTimeString();
  element.innerHTML += `<div>[${time}] ${msg}</div>`;
  element.scrollTop = element.scrollHeight;
}

// ============================================
// SENDER FLOW
// ============================================

document.getElementById('btn-sender').addEventListener('click', () => {
  roleScreen.classList.add('hidden');
  senderScreen.classList.remove('hidden');
  
  // Initialize peer connection as sender
  peer = new PeerConnection('sender');
  peer.onLog = (msg) => log(senderLog, msg);
});

btnSelectFile.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  currentFile = e.target.files[0];
  
  log(senderLog, `File selected: ${currentFile.name} (${(currentFile.size / 1024 / 1024).toFixed(2)} MB)`);
  
  // Show waiting screen and generate offer
  senderWaiting.classList.remove('hidden');
  btnSelectFile.classList.add('hidden');
  
  try {
    log(senderLog, 'Generating connection offer...');
    
    // Create WebRTC offer
    const offer = await peer.createOffer();
    const offerJSON = JSON.stringify(offer);
    
    // Display offer for manual transfer
    senderOffer.value = offerJSON;
    log(senderLog, 'Offer ready! Copy and send to receiver.');
    
    // Enable connect button when answer is pasted
    btnConnectSender.disabled = false;
    
  } catch (err) {
    log(senderLog, `Error: ${err.message}`);
    alert('Failed to create offer: ' + err.message);
  }
});

btnConnectSender.addEventListener('click', async () => {
  const answerJSON = senderAnswerInput.value.trim();
  
  if (!answerJSON) {
    alert('Please paste the answer code from receiver first');
    return;
  }
  
  try {
    log(senderLog, 'Setting answer from receiver...');
    await peer.setAnswer(answerJSON);
    
    // Wait for connection
    peer.onConnected = async () => {
      log(senderLog, 'Connected! Starting file transfer...');
      senderWaiting.classList.add('hidden');
      senderTransfer.classList.remove('hidden');
      
      // Setup progress tracking
      progressTracker = new ProgressTracker(currentFile.size, {
        onUpdate: (stats) => {
          senderProgress.style.width = `${stats.percent}%`;
          senderSpeed.textContent = stats.speed;
          senderEta.textContent = stats.eta;
        },
        onComplete: () => {
          senderFileInfo.textContent = '✅ Transfer complete!';
          senderFileInfo.style.color = '#16a34a';
        }
      });
      
      // Send file
      senderFileInfo.textContent = `Sending: ${currentFile.name}`;
      streamer = new FileStreamer(peer.dataChannel);
      await streamer.sendFile(currentFile, null, progressTracker);
    };
    
  } catch (err) {
    log(senderLog, `Error: ${err.message}`);
    alert('Failed to connect: ' + err.message);
  }
});

senderCancel.addEventListener('click', () => {
  if (peer) peer.close();
  location.reload();
});

// ============================================
// RECEIVER FLOW
// ============================================

document.getElementById('btn-receiver').addEventListener('click', () => {
  roleScreen.classList.add('hidden');
  receiverScreen.classList.remove('hidden');
  
  // Initialize peer connection as receiver
  peer = new PeerConnection('receiver');
  peer.onLog = (msg) => log(receiverLog, msg);
});

btnGenerateAnswer.addEventListener('click', async () => {
  const offerJSON = receiverOfferInput.value.trim();
  
  if (!offerJSON) {
    alert('Please paste the offer code from sender first');
    return;
  }
  
  try {
    log(receiverLog, 'Processing offer from sender...');
    
    // Set offer and generate answer
    const answer = await peer.setOffer(offerJSON);
    const answerJSON = JSON.stringify(answer);
    
    // Display answer for manual transfer back to sender
    receiverAnswer.value = answerJSON;
    receiverAnswerStep.classList.remove('hidden');
    
    log(receiverLog, 'Answer generated! Copy and send back to sender.');
    log(receiverLog, 'Waiting for sender to connect...');
    
    // Wait for connection
    peer.onConnected = async () => {
      log(receiverLog, 'Connected! Waiting for file...');
      receiverConnect.classList.add('hidden');
      receiverTransfer.classList.remove('hidden');
      receiverStatus.textContent = 'Receiving file...';
      
      // Setup progress tracking
      progressTracker = new ProgressTracker(0, {
        onUpdate: (stats) => {
          receiverProgress.style.width = `${stats.percent}%`;
          receiverSpeed.textContent = stats.speed;
          receiverEta.textContent = stats.eta;
        },
        onComplete: () => {
          receiverStatus.textContent = '✅ Download complete! File saved to Downloads.';
          receiverStatus.style.color = '#16a34a';
        }
      });
      
      // Receive file
      streamer = new FileStreamer(peer.dataChannel);
      try {
        const file = await streamer.receiveFile(progressTracker);
        receiverFileInfo.textContent = `Received: ${file.name}`;
        
        // Trigger download
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        log(receiverLog, 'File downloaded successfully');
      } catch (err) {
        log(receiverLog, `Error: ${err.message}`);
        receiverStatus.textContent = `❌ Error: ${err.message}`;
      }
    };
    
  } catch (err) {
    log(receiverLog, `Error: ${err.message}`);
    alert('Failed to process offer: ' + err.message);
  }
});

// ============================================
// PWA Service Worker Registration
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW registration failed:', err));
  });
}

// Handle back button
window.addEventListener('popstate', () => {
  if (peer) peer.close();
});
