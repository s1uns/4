import { useCallback, useEffect, useMemo, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const SOCKET_ACTION = "SOCKET_ACTION";
const socket = io.connect("http://localhost:4000/");

function App() {
	const [user, setUser] = useState({ id: null, name: "" });
	const [message, setMessage] = useState("");
	const [messagesList, setMessagesList] = useState([]);
	const [users, setUsers] = useState([]);

	useEffect(() => {
		const handleReceiveMessage = (data) => {
			setMessagesList((prev) => [...prev, data]);
		};

		const handleConnectionSuccessful = (data) => {
			setUser(data.user);
			setUsers(data.users);
			setMessagesList([]);
		};

		const handleNewUser = (data) => {
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

		socket.on("receive_message", handleReceiveMessage);
		socket.on("connection_successful", handleConnectionSuccessful);
		socket.on("new_user", handleNewUser);
		socket.on("user_disconnected", handleUserDisconnected);

		return () => {
			socket.off("receive_message", handleReceiveMessage);
			socket.off("connection_successful", handleConnectionSuccessful);
			socket.off("new_user", handleNewUser);
			socket.off("user_disconnected", handleUserDisconnected);
		};
	}, []);

	const sendMessage = useCallback(() => {
		if (!message.trim()) return alert("Enter some text first!");
		if (!user.id) return alert("Enter the chat first!");

		const timestamp = new Date();
		const newMessage = {
			sender_name: user.name,
			sender_id: user.id,
			text: message,
			createdAt: timestamp.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			}),
		};

		socket.emit(SOCKET_ACTION, {
			type: "send_message",
			payload: newMessage,
		});
		setMessagesList((prev) => [...prev, newMessage]);
		setMessage("");
	}, [message, user]);

	const handleChange = useCallback((e) => setMessage(e.target.value), []);
	const handleUserChange = useCallback(
		(e) => setUser((prev) => ({ ...prev, name: e.target.value })),
		[],
	);
	const handleConnect = useCallback(() => {
		if (!user.name.trim()) return alert("Enter your name!");
		socket.emit(SOCKET_ACTION, { type: "connection", payload: user });
	}, [user]);

	const isConnected = useMemo(() => Boolean(user.id), [user.id]);

	return (
		<div className="App">
			{isConnected ? (
				<>
					<div className="chat-header">
						<div className="user-list">
							<h3>Connected Users</h3>
							<ul>
								{users.map((user) => (
									<li key={user.id}>{user.name}</li>
								))}
							</ul>
						</div>
						<div className="chat-box">
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
											message.sender_id === user.id
												? "own"
												: ""
										} ${
											message.isLeft || message.isJoined
												? "left-message"
												: ""
										}`}
									>
										{message.isLeft || message.isJoined ? (
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
