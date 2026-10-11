"use strict";

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

const MODEL = "gemini-3.8-flash";

const $ = (id) => document.getElementById(id);

let tasks = [];
let busy = false;

function log(title, detail, icon = "✦") {
  const host = $("activity");
  const node = document.createElement("div");
  node.className = "activity-item";

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.textContent = icon;

  const body = document.createElement("div");

  const heading = document.createElement("b");
  heading.textContent = title;

  const p = document.createElement("p");
  p.textContent = detail;

  body.append(heading, p);
  node.append(dot, body);
  host.prepend(node);
}

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

function renderTasks() {
  const host = $("tasks");
  host.replaceChildren();

  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No tasks created yet.";
    host.append(empty);
    return;
  }

  tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "task" + (task.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", "Mark task complete");

    checkbox.addEventListener("change", () => {
      task.done = checkbox.checked;
      renderTasks();
      log(
        task.done ? "Task completed" : "Task reopened",
        task.title,
        "✓"
      );
    });

    const text = document.createElement("div");
    text.className = "tasktext";

    const title = document.createElement("strong");
    title.textContent = task.title;

    const small = document.createElement("small");
    small.textContent =
      `Day ${task.day} · ${task.minutes} min` +
      (task.description ? " · " + task.description : "");

    text.append(title, small);

    const badge = document.createElement("span");
    badge.className = "priority";
    badge.textContent = task.priority;

    row.append(checkbox, text, badge);
    host.append(row);
  });
}

/* Gemini tool declarations */
const TOOL_DECLARATIONS = [
  {
    type: "function",
    name: "create_tasks",
    description:
      "Create actionable study tasks distributed across the planning period. Respect the daily time limit.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              day: { type: "integer" },
              minutes: { type: "integer" },
              priority: {
                type: "string",
                enum: ["HIGH", "MEDIUM", "LOW"]
              }
            },
            required: [
              "title",
              "description",
              "day",
              "minutes",
              "priority"
            ],
            additionalProperties: false
          }
        }
      },
      required: ["tasks"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "list_tasks",
    description: "List current tasks and completion status.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "prioritize_tasks",
    description: "Sort tasks by priority and day.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "reflect_progress",
    description:
      "Inspect task status and reflect honestly on progress. Only user-checked tasks count as completed.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "write_report",
    description:
      "Write the final report including the day-wise plan, priorities, assumptions, risks, and next action.",
    parameters: {
      type: "object",
      properties: {
        report: { type: "string" }
      },
      required: ["report"],
      additionalProperties: false
    }
  }
];

/* Execute the tools requested by Gemini */
function executeTool(name, args, planningDays, dailyMinutes) {
  if (name === "create_tasks") {
    if (!Array.isArray(args.tasks)) {
      throw new Error("create_tasks did not receive a tasks array.");
    }

    tasks = args.tasks.slice(0, 40).map((t, i) => {
      const dayValue = Number(t.day);
      const minuteValue = Number(t.minutes);
      const givenPriority = String(t.priority || "MEDIUM").toUpperCase();

      return {
        id: `${Date.now()}-${i}`,
        title: String(t.title || "Study task").slice(0, 140),
        description: String(t.description || "").slice(0, 280),
        day: Number.isFinite(dayValue)
          ? Math.max(1, Math.min(planningDays, Math.floor(dayValue)))
          : 1,
        minutes: Number.isFinite(minuteValue)
          ? Math.max(5, Math.min(dailyMinutes, Math.floor(minuteValue)))
          : 30,
        priority: ["HIGH", "MEDIUM", "LOW"].includes(givenPriority)
          ? givenPriority
          : "MEDIUM",
        done: false
      };
    });

    const dailyTotals = new Map();

    tasks.forEach((task) => {
      dailyTotals.set(
        task.day,
        (dailyTotals.get(task.day) || 0) + task.minutes
      );
    });

    const overloadedDays = [...dailyTotals.entries()]
      .filter(([, total]) => total > dailyMinutes)
      .map(([day]) => day);

    renderTasks();

    log(
      "Tasks created",
      `${tasks.length} tasks added to the execution board.`,
      "✓"
    );

    return {
      created: tasks.length,
      dailyLimitMinutes: dailyMinutes,
      overloadedDays,
      tasks: tasks.map(({ title, day, minutes, priority }) => ({
        title,
        day,
        minutes,
        priority
      }))
    };
  }

  if (name === "list_tasks") {
    return {
      tasks: tasks.map(
        ({ title, description, day, minutes, priority, done }) => ({
          title,
          description,
          day,
          minutes,
          priority,
          done
        })
      )
    };
  }

  if (name === "prioritize_tasks") {
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };

    tasks.sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        rank[a.priority] - rank[b.priority] ||
        a.day - b.day
    );

    renderTasks();

    return {
      sorted: true,
      order: tasks.map(({ title, day, priority, done }) => ({
        title,
        day,
        priority,
        done
      }))
    };
  }

  if (name === "reflect_progress") {
    const completed = tasks.filter((task) => task.done).length;

    return {
      total: tasks.length,
      completed,
      remaining: tasks.length - completed,
      note:
        "This is a plan, not completed work. Do not mark tasks complete unless the user checks them."
    };
  }

  if (name === "write_report") {
    const report = String(args.report || "No report text was provided.");

    $("report").textContent = report;
    $("report").classList.remove("empty");

    log("Report generated", "The final report is ready.", "✓");

    return {
      written: true,
      characters: report.length
    };
  }

  return { error: "Unknown tool: " + name };
}

/* Send one request to Gemini 3.8 Flash */
async function callGemini(apiKey, input, previousInteractionId) {
  const payload = {
    model: MODEL,
    input,
    tools: TOOL_DECLARATIONS
  };

  if (previousInteractionId) {
    payload.previous_interaction_id = previousInteractionId;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Google returned HTTP ${response.status}: ${raw.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Gemini API HTTP ${response.status}: ` +
      (data?.error?.message || raw.slice(0, 1000))
    );
  }

  if (data.status === "failed") {
    throw new Error(data.error?.message || "Gemini interaction failed.");
  }

  return data;
}

function getFunctionCalls(data) {
  return (Array.isArray(data.steps) ? data.steps : [])
    .filter((step) => step && step.type === "function_call");
}

function getOutputText(data) {
  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const parts = [];

  for (const step of data.steps || []) {
    if (Array.isArray(step.content)) {
      for (const item of step.content) {
        if (item.type === "text" && item.text) {
          parts.push(item.text);
        }
      }
    }

    if (typeof step.text === "string") {
      parts.push(step.text);
    }
  }

  return parts.join("\n").trim();
}

/* Main ORBIT agent loop */
async function runAgent() {
  if (busy) return;

  const apiKey = $("apiKey").value.trim();
  const goal = $("goal").value.trim();

  const days = Math.max(
    1,
    Math.min(30, Math.floor(Number($("days").value) || 5))
  );

  const hours = Math.max(
    1,
    Math.min(12, Number($("hours").value) || 2)
  );

  const dailyMinutes = Math.floor(hours * 60);

  if (!apiKey) {
    alert("Enter your Gemini API key first.");
    $("apiKey").focus();
    return;
  }

  if (!goal) {
    alert("Describe the goal you want ORBIT to plan.");
    $("goal").focus();
    return;
  }

  busy = true;

  $("runAgent").disabled = true;
  $("runAgent").textContent = "Agent working…";

  $("activity").replaceChildren();
  $("report").textContent = "Agent is working…";
  $("report").classList.add("empty");

  tasks = [];
  renderTasks();

  setStatus("Running", "running");

  log("Goal received", goal, "◎");
  log(
    "Connecting",
    `Using ${MODEL} through the Gemini Interactions API.`,
    "↗"
  );

  const prompt = `
You are ORBIT, an autonomous study and productivity planner.

USER GOAL: ${goal}
PLANNING HORIZON: ${days} days
AVAILABLE DAILY TIME: ${hours} hours (${dailyMinutes} minutes)

Mandatory workflow:
1. Call create_tasks with a realistic day-by-day plan.
2. Call list_tasks and inspect the created plan.
3. Call prioritize_tasks.
4. Call reflect_progress.
5. Call write_report with the final complete report.

Use the tools rather than merely describing tool calls.
Keep total task minutes per day within ${dailyMinutes}.
If create_tasks reports overloadedDays, create a corrected schedule.
Make tasks concrete and actionable.
Every task must have a title, description, day, duration in minutes,
and HIGH, MEDIUM, or LOW priority.
Do not claim work has been completed: this is a proposed plan.
The final report must cover the daily plan, priorities, assumptions,
risks, and the next action.
Finish by using write_report.
`;

  let previousInteractionId = null;
  let input = prompt;
  let finished = false;

  try {
    for (let turn = 1; turn <= 12; turn++) {
      log("Agent turn " + turn, "Thinking and checking the plan.", "✦");

      const data = await callGemini(
        apiKey,
        input,
        previousInteractionId
      );

      if (data.id) {
        previousInteractionId = data.id;
      }

      const calls = getFunctionCalls(data);

      if (!calls.length) {
        const text = getOutputText(data);

        if (text) {
          log("Agent response", text, "AI");

          if (
            $("report").classList.contains("empty") ||
            $("report").textContent === "Agent is working…"
          ) {
            $("report").textContent = text;
            $("report").classList.remove("empty");
          }
        }

        finished = true;
        break;
      }

      const results = [];

      for (const call of calls) {
        let args = call.arguments || {};

        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            throw new Error(
              `Invalid JSON arguments from tool ${call.name}.`
            );
          }
        }

        log(
          "Tool call: " + call.name,
          JSON.stringify(args),
          "⚙"
        );

        let result;

        try {
          result = executeTool(
            call.name,
            args,
            days,
            dailyMinutes
          );
        } catch (error) {
          result = { error: error.message };
        }

        log(
          "Tool result: " + call.name,
          JSON.stringify(result),
          "✓"
        );

        results.push({
          type: "function_result",
          name: call.name,
          call_id: call.id,
          result: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        });
      }

      if (!previousInteractionId) {
        throw new Error(
          "Google did not return an interaction ID for the next tool step."
        );
      }

      input = results;
    }

    if (!finished) {
      throw new Error(
        "The agent reached its 12-turn limit. Try a simpler goal."
      );
    }

    if (!tasks.length) {
      log(
        "Warning",
        "No tasks were created. Try running the agent again.",
        "!"
      );
    }

    setStatus("Complete");
    log("Run complete", "ORBIT finished this planning run.", "✓");

  } catch (error) {
    console.error("ORBIT Gemini error:", error);

    setStatus("Error", "error");
    log("Agent error", error.message, "!");

    $("report").textContent =
      "ORBIT stopped with an error:\n\n" +
      error.message +
      "\n\nCheck your API key, model access, quota, and browser console.";

    $("report").classList.remove("empty");

  } finally {
    busy = false;
    $("runAgent").disabled = false;
    $("runAgent").textContent = "✦ Run agent";
  }
}

/* Browser controls */
$("runAgent").addEventListener("click", runAgent);

$("toggleKey").addEventListener("click", () => {
  const field = $("apiKey");

  field.type = field.type === "password" ? "text" : "password";

  $("toggleKey").textContent =
    field.type === "password" ? "Show" : "Hide";
});

$("clearTasks").addEventListener("click", () => {
  if (busy) return;

  tasks = [];
  renderTasks();
  log("Tasks cleared", "The task board is empty.", "×");
});

$("copyReport").addEventListener("click", async () => {
  const report = $("report").textContent;

  try {
    await navigator.clipboard.writeText(report);
    $("copyReport").textContent = "Copied";

    setTimeout(() => {
      $("copyReport").textContent = "Copy report";
    }, 1200);

  } catch {
    alert("Clipboard access failed. Select and copy the report manually.");
  }
});

renderTasks();
