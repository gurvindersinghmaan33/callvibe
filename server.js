import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Replace this with the specific origin you want to allow
    methods: ["GET", "POST"],
  },
});
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Default route to serve index.html (or any other HTML files)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); // Ensure index.html is in 'public'
});
const PORT = process.env.PORT || 3233;

const waitingUsers = []; // Queue for waiting users
const activeCalls = {}; // Object to track active calls by socket ID
const userTimeouts = {};  // A map to track user timeouts
let filteredUsers = [];
let currentUserInterests;
let matchCount;
let result;
let message = "";

// handle socket connections
io.on("connection", (socket) => {
  socket.on("offer", ({ offer, gender, age, interests }) => {
    if (waitingUsers.length > 0) {
      let otherUser;

      filteredUsers = waitingUsers;

      // Go through waiting users to find a match
      if (gender != "any") {
        const vibeGender = gender === "female" ? "male" : "female";
        filteredUsers = filteredUsers.filter((user) => user['gender'] == vibeGender);
      }

      function inRange(age, minAge, maxAge) {
        return (minAge <= age <= maxAge);
      }

      if (age) {
        const minAge = age - 10;
        const maxAge = age + 10;
        filteredUsers = filteredUsers.filter((user) => inRange(user['age']));
      }

      function countMatchingInterests(user, noOfUserInterests) {
        matchCount = user.interests.filter((interest) => currentUserInterests.has(interest)).length;
        if (matchCount == noOfUserInterests) {
          return user;
        }
        return matchCount;
      }

      function getBestMatchedUser(filteredUsers, interests) {
        currentUserInterests = new Set(interests); // Convert interests to a Set for fast lookup

        const noOfUserInterests = currentUserInterests.size;
        for (let i = 0; i < filteredUsers.length; i++) {
          result = countMatchingInterests(filteredUsers[i], noOfUserInterests);
          // If a user is returned (all interests matched), return it immediately
          if (result === filteredUsers[i]) {
            return filteredUsers[i]; // Return the perfect match
          }
          // If match count is 0, remove the user from the list
          else if ((typeof result === "number") && (result === 0)) {
            filteredUsers.splice(i, 1); // Remove user at index i
            i--;
          }
          else {
            // Store the match count for sorting later
            filteredUsers[i].matchCount = result;
          }
        }
        // Sort the remaining users by match count in descending order
        filteredUsers.sort((a, b) => b.matchCount - a.matchCount);

        // Return the best partially matched user or null if no users remain
        return filteredUsers.length > 0 ? filteredUsers[0] : null;
      }

      if ((interests.filter((interest) => interest.trim() !== "").length) > 0) {
        const bestMatchedUser = getBestMatchedUser(filteredUsers, interests);

        if (bestMatchedUser) {
          otherUser = bestMatchedUser;
          interests = interests.filter((interest) => otherUser['interests'].includes(interest));
          message = ("You both are Interested in " + interests);
        }
        else {
          otherUser = waitingUsers.shift(); // Get the first user in the queue
        }
      }
      else if ((filteredUsers.length) > 0) {
        otherUser = filteredUsers[0];
      }
      else {
        otherUser = waitingUsers.shift();
      }

      io.to(otherUser.id).emit("offer", { offer: offer, offer_came_from: socket.id, message: message });
      activeCalls[socket.id] = otherUser['id']; // Track the active call
      activeCalls[otherUser.id] = socket.id;
      // Clear the timeout once the user is paired
      clearTimeout(userTimeouts[socket.id]);
      clearTimeout(userTimeouts[otherUser.id]);
      filteredUsers.length = 0;
    } else {
      const user = { id: socket.id, gender: gender, age: age, interests: interests, matchCount: 0 };
      waitingUsers.push(user); // add the user to the last in waiting list 
      // Set a timeout for the user waiting
      const timeout = setTimeout(() => {
        const index = waitingUsers.indexOf(user);
        if (index !== -1) {
          waitingUsers.splice(index, 1); // Remove the user from the waiting list
          socket.emit("noUserAvailable", { message: "No users available for call. Please try again later." });

          // Disconnect the user after the timeout
          socket.disconnect(true);  // Disconnect the socket immediately

          // Optionally, you could log the disconnection or handle cleanup here
        }
        delete userTimeouts[socket.id];  // Clean up timeout tracking
      }, 60000); // 60 seconds timeout

      // Store the timeout ID in the userTimeouts map
      userTimeouts[socket.id] = timeout;
    }
  });

  socket.on("answer", ({ answer_sent_to, answer }) => {
    io.to(answer_sent_to).emit("answer", { answer });
  });

  // Handle 'icecandidate' event
  socket.on("icecandidate", (candidate) => {
    const ice_candidate_to = activeCalls[socket.id];
    if (ice_candidate_to) {
      io.to(ice_candidate_to).emit("icecandidate", candidate);
    }

  });

  socket.on("endCall", () => {
    // Notify the other peer to terminate the call
    const otherUserId = activeCalls[socket.id];
    if (otherUserId) {
      io.to(otherUserId).emit("endCall"); // Notify the other user
      delete activeCalls[socket.id];
      delete activeCalls[otherUserId];
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    // Remove user from the waiting list if applicable
    const waitingIndex = waitingUsers.findIndex((user) => user.id === socket.id);
    if (waitingIndex !== -1) {
      waitingUsers.splice(waitingIndex, 1);
    }

    // End any active call the user was part of
    const otherUserId = activeCalls[socket.id];
    if (otherUserId) {
      io.to(otherUserId).emit("endCall"); // Notify the other user
      delete activeCalls[socket.id];
      delete activeCalls[otherUserId];
    }
  });
});

server.listen(PORT, () => { });
