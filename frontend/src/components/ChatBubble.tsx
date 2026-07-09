import MarkdownView from "./MarkdownView";

export default function ChatBubble({
  role,
  content,
}: {
  role: string;
  content: string;
}) {
  const isInterviewer = role === "interviewer";
  return (
    <div className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] rounded-lg px-4 py-2 ${
          isInterviewer
            ? "bg-white border border-gray-200"
            : "bg-blue-600 text-white"
        }`}
      >
        <div className="text-xs mb-1 opacity-70">
          {isInterviewer ? "面试官" : "我"}
        </div>
        <MarkdownView>{content}</MarkdownView>
      </div>
    </div>
  );
}
