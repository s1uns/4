import { useCallback, useEffect, useMemo, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const SOCKET_ACTION = "SOCKET_ACTION";
const url = process.env.REACT_APP_BACKEND_URL;
const socket = io.connect(url);

console.log("ENVIRONMENT URL: ", url);

function App() {
	const [user, setUser] = useState({ id: null, name: "" });
	const [message, setMessage] = useState("");
	const [messagesList, setMessagesList] = useState([]);
	const [users, setUsers] = useState([]);
	const [sharedKey, setSharedKey] = useState(null);
	const [privateKey, setPrivateKey] = useState(null);
	const [p, setP] = useState(null);
	const [g, setG] = useState(null);
	const [isSharing, setIsSharing] = useState(false);

	useEffect(() => {
		if (p) {
			const key = Math.floor(Math.random() * 100) + 1;
			setPrivateKey(key);
			const sharedKey = BigInt(g) ** BigInt(key) % BigInt(p);
			setSharedKey(sharedKey);
		}
	}, [g, p]);

	useEffect(() => {
		const handleReceiveMessage = async (data) => {
			const decryptedMessage = {
				...data,
				text: await caesarDecrypt(data.text, sharedKey),
			};
			setMessagesList((prev) => [...prev, decryptedMessage]);
		};

		const handleConnectionSuccessful = async (data) => {
			setUser(data.user);
			setUsers(data.users);
			setMessagesList([]);
		};

		const handleConnectionEstablished = async (data) => {
			setP(BigInt(data.p));
			setG(BigInt(data.g));
		};

		const handleNewUser = async (data) => {
			setUsers((prev) => [...prev, data]);
			setMessagesList((prev) => [
				...prev,
				{ sender_name: data.name, isJoined: true },
			]);
		};

		const handleUserDisconnected = (data) => {
			setUsers((prev) => prev.filter((user) => user.id !== data.id));
			setMessagesList((prev) => [
				...prev,
				{ sender_name: data.name, isLeft: true },
			]);
		};

		const handleShareKeyIteration = async (data) => {
			setIsSharing(true);

			const { publicKey, startIndex, iteration, isFinal, id } = data;

			const sharedKey =
				BigInt(publicKey) ** BigInt(privateKey) % BigInt(p);

			if (isFinal) {
				setSharedKey(sharedKey);
				setIsSharing(false);
			} else {
				socket.emit(SOCKET_ACTION, {
					type: "shared_key_generation_client",
					payload: {
						publicKey: sharedKey.toString(),
						iteration,
						startIndex,
					},
				});
			}
		};

		socket.on("receive_message", handleReceiveMessage);
		socket.on("connection_successful", handleConnectionSuccessful);
		socket.on("new_user", handleNewUser);
		socket.on("user_disconnected", handleUserDisconnected);
		socket.on("connection_established", handleConnectionEstablished);
		socket.on("shared_key_generation_server", handleShareKeyIteration);

		return () => {
			socket.off("receive_message", handleReceiveMessage);
			socket.off("connection_successful", handleConnectionSuccessful);
			socket.off("new_user", handleNewUser);
			socket.off("user_disconnected", handleUserDisconnected);
			socket.off("connection_established", handleConnectionEstablished);
			socket.off("shared_key_generation_server", handleShareKeyIteration);
		};
	}, [privateKey, sharedKey, p, g, user]);

	const caesarEncrypt = async (text, shift) => {
		const bigShift = BigInt(shift) % 26n;
		return text
			.split("")
			.map((char) => {
				const code = char.charCodeAt(0);
				if (code >= 65 && code <= 90) {
					return String.fromCharCode(
						Number(((BigInt(code - 65) + bigShift) % 26n) + 65n),
					);
				} else if (code >= 97 && code <= 122) {
					return String.fromCharCode(
						Number(((BigInt(code - 97) + bigShift) % 26n) + 97n),
					);
				}
				return char;
			})
			.join("");
	};

	const caesarDecrypt = async (text, shift) => {
		const bigShift = 26n - (BigInt(shift) % 26n);
		return caesarEncrypt(text, bigShift);
	};

	const generatePublicKey = useCallback(async () => {
		const res = BigInt(g) ** BigInt(privateKey) % BigInt(p);
		return res;
	}, [g, p, privateKey]);

	const sendMessage = useCallback(async () => {
		if (!message.trim()) return alert("Enter some text first!");
		if (!user.id) return alert("Enter the chat first!");

		const messageText = message.trim();

		const timestamp = new Date();
		const newMessage = {
			sender_name: user.name,
			sender_id: user.id,
			text: messageText,
			createdAt: timestamp.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			}),
		};

		setMessagesList((prev) => [...prev, newMessage]);

		socket.emit(SOCKET_ACTION, {
			type: "send_message",
			payload: {
				...newMessage,
				text: await caesarEncrypt(messageText, sharedKey),
			},
		});
		setMessage("");
	}, [message, user]);

	const handleChange = useCallback((e) => setMessage(e.target.value), []);
	const handleUserChange = useCallback(
		(e) => setUser((prev) => ({ ...prev, name: e.target.value })),
		[],
	);
	const handleConnect = useCallback(async () => {
		if (!user.name.trim()) return alert("Enter your name!");
		const publicKey = (await generatePublicKey()).toString();
		socket.emit(SOCKET_ACTION, {
			type: "connection",
			payload: { ...user, publicKey },
		});
	}, [user]);

	const isConnected = useMemo(() => Boolean(user.id), [user.id]);

	return (
		<div className="App">
			{isConnected ? (
				<>
					<div className="chat-header">
						<div className="user-list">
							<h2>Current User: {user.name}</h2>
							<h3>Connected Users</h3>
							<ul>
								{users.map((user) => (
									<li key={user.id}>{user.name}</li>
								))}
							</ul>
						</div>
						<div className="chat-box">
							{isSharing ? (
								<div className="generating-container">
									Generating new keys...
								</div>
							) : (
								<>
									<input
										className="message-input"
										placeholder="Message..."
										value={message}
										onChange={handleChange}
									/>
									<button
										className="send-button"
										onClick={sendMessage}
									>
										Send
									</button>
									<div className="chat-container">
										{messagesList.map((message, index) => (
											<div
												key={index}
												className={`message ${
													message.sender_id ===
													user.id
														? "own"
														: ""
												} ${
													message.isLeft ||
													message.isJoined
														? "left-message"
														: ""
												}`}
											>
												{message.isLeft ||
												message.isJoined ? (
													<div className="left-notice">
														{message.sender_name}
														{message.isLeft
															? " has left the conversation"
															: " has joined the conversation"}
													</div>
												) : (
													<>
														<div className="sender">
															{message.sender_id !==
															user.id
																? message.sender_name
																: "Me"}
														</div>
														<div className="text">
															{message.text}
														</div>
														<div className="date">
															{message.createdAt}
														</div>
													</>
												)}
											</div>
										))}
									</div>
								</>
							)}
						</div>
					</div>
				</>
			) : (
				<div className="connect-box">
					<input
						placeholder="Enter your name"
						value={user.name}
						onChange={handleUserChange}
					/>
					<button onClick={handleConnect}>Enter the chat</button>
				</div>
			)}
		</div>
	);
}

export default App;
