import express from "express";
import { createServer } from "http";
import cors from "cors";
import { Server } from "socket.io";
import uuid4 from "uuid4";
import { prime } from "bigint-crypto-utils";

const SOCKET_ACTION = "SOCKET_ACTION";
const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let users = [];

const ranBetween = async (min, max) => {
	return Math.round(Math.random() * (max - min) + min);
};

const findPrimitiveRoot = async (k) => {
	var p = 2n * BigInt(k) + 1n;

	while (true) {
		const x = BigInt(await ranBetween(1, 100));

		if (x % p != 1n && x ** 2n != 1n && x ** k != 1n) {
			return x;
		}
	}
};

const p = await prime(24);
const g = await findPrimitiveRoot(p);

console.log("Generated p: ", p);
console.log("Generated g: ", g);

const addUser = (name, socketId, publicKey) => {
	const userId = uuid4();
	const newUser = { id: userId, name, socketId, publicKey };
	users.push(newUser);
	return newUser;
};

const removeUser = (socketId) => {
	const user = users.find((user) => user.socketId === socketId);
	if (user) {
		users = users.filter((u) => u.id !== user.id);
	}
	return user;
};

io.on("connection", (socket) => {
	console.log(`User connected with socket ID: ${socket.id}`);

	socket.emit("connection_established", { p: p.toString(), g: g.toString() });

	socket.on(SOCKET_ACTION, async ({ type, payload }) => {
		switch (type) {
			case "connection":
				if (!payload?.name) return;
				const newUser = addUser(
					payload.name,
					socket.id,
					payload.publicKey,
				);

				console.log(
					`New user connected:\n name - ${newUser.name}, id - ${newUser.id}, socket id - ${socket.id}, public key - ${payload.publicKey}`,
				);

				socket.emit("connection_successful", {
					user: newUser,
					users,
				});

				await users.map((user) => {
					if (user.id !== newUser.id) {
						io.to(user.socketId).emit("new_user", newUser);
					}
				});

				if (users.length > 1) {
					await startKeyExchange();
				}
				break;

			case "send_message":
				if (!payload?.text) return;

				await users.map((user) => {
					if (user.id !== payload.sender_id) {
						io.to(user.socketId).emit("receive_message", payload);
					}
				});

				break;

			case "shared_key_generation_client":
				const { startIndex, iteration, publicKey } = payload;

				const nextIteration = iteration + 1;
				const nextIndex = (startIndex + nextIteration) % users.length;
				let isFinal;
				if (!startIndex) {
					isFinal = nextIndex === users.length - 1;
				} else {
					isFinal = nextIndex === startIndex - 1;
				}

				if (isFinal) {
					const finalUser = users[nextIndex];
					io.to(finalUser.socketId).emit(
						"shared_key_generation_server",
						{
							publicKey,
							iteration: nextIteration,
							startIndex,
							isFinal,
						},
					);
				} else {
					const nextUser = users[nextIndex];
					io.to(nextUser.socketId).emit(
						"shared_key_generation_server",
						{
							publicKey,
							iteration: nextIteration,
							startIndex,
							isFinal,
						},
					);
				}
				break;

			default:
				console.error("Unknown action type:", type);
		}
	});

	socket.on("disconnect", async () => {
		const leftUser = removeUser(socket.id);
		if (leftUser) {
			await users.map((user) => {
				if (user.id !== leftUser.id) {
					io.to(user.socketId).emit("user_disconnected", {
						id: leftUser.id,
						name: leftUser.name,
					});
				}
			});
		}

		if (users.length > 1) {
			await startKeyExchange();
		}
	});
});

const startKeyExchange = async () => {
	users.forEach((user, startIndex) => {
		const nextIndex = (startIndex + 1) % users.length;
		const nextUser = users[nextIndex];

		io.to(nextUser.socketId).emit("shared_key_generation_server", {
			publicKey: user.publicKey,
			iteration: 1,
			startIndex,
			isFinal: users.length === 2,
			id: nextUser.id,
			isStart: true,
		});
	});
};

server.listen(4000, () => console.log("Server running on port 4000"));

export default server;
