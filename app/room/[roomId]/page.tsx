"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { client } from "@/lib/eden";
import { useUsername } from "@/hooks/use-username";
import { useRealtime } from "@/lib/realtime-client";

const formatTimeremaining = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const ChatRoom = () => {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  const username = useUsername();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState("Copy");
  const [input, setInput] = useState("");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } });
      return res.data;
    },
  });

  const { data: ttlData } = useQuery({
    queryKey: ["ttl", roomId],
    queryFn: async () => {
      const res = await client.room.ttl.get({ query: { roomId } });
      return res.data;
    },
  });

  useEffect(() => {
    if (ttlData?.ttl !== undefined) {
      setTimeRemaining(ttlData.ttl);
    }
  }, [ttlData]);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining < 0) return;

    if (timeRemaining === 0) {
      router.push("/?destroyed=true");
      return;
    }

    const ttlInterval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev < 1) {
          clearInterval(ttlInterval);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(ttlInterval);
  }, [timeRemaining, router]);

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      await client.messages.post(
        { sender: username, text },
        { query: { roomId } }
      );
    },
  });

  const handleSendMessage = () => {
    sendMessage({ text: input });
    setInput("");
    inputRef.current?.focus();
  };

  const { mutate: deleteRoom } = useMutation({
    mutationFn: async () => {
      await client.room.delete(null, { query: { roomId } });
    },
  });

  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy"],
    onData: ({ event }) => {
      if (event === "chat.message") {
        refetch();
      }

      if (event === "chat.destroy") {
        router.push("/?destroyed=true");
      }
    },
  });

  const copyRoom = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopyStatus("Copied");
    setTimeout(() => setCopyStatus("Copy"), 3000);
  };

  return (
    <main className="flex flex-col h-screen max-h-screen overflow-hidden">
      <header className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">
              &gt; room id:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">&gt;</span>
              <span className="font-bold text-green-500">{roomId}</span>
              <button
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                onClick={copyRoom}
              >
                {copyStatus}
              </button>
            </div>
          </div>
          <div className="h-8 w-px bg-zinc-800" />
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">
              &gt; self-destruct:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">&gt;</span>
              <span
                className={`text-sm font-bold flex items-center gap-2 ${
                  timeRemaining && timeRemaining < 60
                    ? "text-red-500"
                    : "text-amber-500"
                }`}
              >
                {timeRemaining ? formatTimeremaining(timeRemaining) : "--:--"}
              </span>
            </div>
          </div>
        </div>
        <button
          className="text-xs bg-zinc-800 hover:bg-red-600 px-3 py-1.5 rounded text-zinc-400 hover:text-white font-bold transition-all group flex items-center gap-2 disabled:opacity-50 uppercase"
          onClick={() => deleteRoom()}
        >
          <span className="group-hover:animate-pulse">💣</span>destroy now
        </button>
      </header>
      <div className="flex-1 overflow-y-auto space-y-4 p-4 scrollbar-thin">
        {messages?.messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm font-mono">
              No messages yet, start the conversation.
            </p>
          </div>
        )}
        {messages?.messages.map((mess) => (
          <div
            key={mess.id}
            className={`flex flex-col ${
              mess.sender === username ? "items-start" : "items-end"
            }`}
          >
            <div className="max-w-[80%] group">
              <div className="flex items-baseline gap-3 mb-1">
                <span
                  className={`text-xs font-bold ${
                    mess.sender === username
                      ? "text-green-500"
                      : "text-blue-500"
                  }`}
                >
                  {mess.sender === username ? "You" : mess.sender}
                </span>
                <span
                  className={`text-[10px] text-zinc-600 ${
                    mess.sender === username ? "" : "order-first"
                  }`}
                >
                  {mess.timestamp && format(mess.timestamp, "HH:mm")}
                </span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed break-all">
                {mess.text}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex gap-4">
          <div className="flex-1 relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 ext-green-500 animate-pulse">
              &gt;
            </span>
            <input
              autoFocus
              type="text"
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 pl-8 pr-4 text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              ref={inputRef}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  handleSendMessage();
                }
              }}
            />
          </div>
          <button
            className="bg-zinc-800 text-zinc-400 px-6 text-sm font-bold hover:text-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            onClick={handleSendMessage}
            disabled={input.length === 0 || isPending}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </main>
  );
};

export default ChatRoom;
