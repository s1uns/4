const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const SOCKET_ACTION = "SOCKET_ACTION";
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let users = [];

const addUser = (name, socketId) => {
	const userId = users.length + 1;
	const newUser = { id: userId, name, socketId };
	users.push(newUser);
	return newUser;
};

const removeUser = (socketId) => {
	const user = users.find((user) => user.socketId === socketId);
	if (user) users = users.filter((u) => u.id !== user.id);
	return user;
};

io.on("connection", (socket) => {
	console.log(`User connected with socket ID: ${socket.id}`);

	socket.on(SOCKET_ACTION, ({ type, payload }) => {
		switch (type) {
			case "connection":
				if (!payload?.name) return;
				const newUser = addUser(payload.name, socket.id);
				socket.emit("connection_successful", { user: newUser, users });
				socket.broadcast.emit("new_user", newUser);
				break;

			case "send_message":
				if (!payload?.text) return;
				socket.broadcast.emit("receive_message", payload);
				break;

			default:
				console.error("Unknown action type:", type);
		}
	});

	socket.on("disconnect", () => {
		const leftUser = removeUser(socket.id);
		if (leftUser) {
			socket.broadcast.emit("user_disconnected", {
				id: leftUser.id,
				name: leftUser.name,
			});
		}
	});
});

server.listen(4000, () => console.log("Server running on port 4000"));
