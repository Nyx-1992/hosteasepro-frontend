"use client";
import { useEffect, useState } from "react";

type Role = "admin" | "assistant";

interface Task {
  id: number;
  title: string;
  completed: boolean;
  assigned_to: string;
}

export default function TaskSection({ role }: { role: Role }) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch("https://hosteasepro-backend.vercel.app/tasks");
        const data: Task[] = await res.json();
        setTasks(data);
      } catch (err) {
        console.error("Failed to fetch tasks", err);
      }
    };
    fetchTasks();
  }, []);

  const toggleComplete = async (id: number) => {
    await fetch(`https://hosteasepro-backend.vercel.app/tasks/${id}`, {
      method: "PATCH",
    });
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const visibleTasks = tasks.filter((task) => role === "admin" || task.assigned_to === role);

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">✅ Task Manager</h2>
      {visibleTasks.length === 0 ? (
        <p>No tasks assigned yet.</p>
      ) : (
        <ul className="space-y-4">
          {visibleTasks.map((task) => (
            <li
              key={task.id}
              className={`border p-4 rounded-md shadow-sm flex items-center justify-between ${
                task.completed ? "bg-green-50" : "bg-white"
              }`}
            >
              <span
                className={`${task.completed ? "line-through text-gray-500" : ""}`}
              >
                {task.title}
              </span>
              <button
                onClick={() => toggleComplete(task.id)}
                className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 text-sm"
              >
                {task.completed ? "Undo" : "Complete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}