
"use strict";

/*
 * ORBIT — Agentic Study Planner
 * Gemini Interactions API with executable agent tools.
 *
 * SECURITY WARNING:
 * A key embedded in public JavaScript is visible to everyone.
 * Use a disposable key with appropriate restrictions.
 * Never use a sensitive production key here.
 */

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

const MODEL = "gemini-3.8-flash";

// Paste your NEW Gemini API key between the quotes.
// This line will be public in your GitHub repository.
const GEMINI_API_KEY = "AQ.Ab8RN6JzfLtwjDEiegHrE2exTtzQF_ZNzyCaUv5F5EmLVbA9cw";

const state = {
  tasks: [],
  activity: [],
  report: "",
  running: false
};

const $ = (id) => document.getElementById(id);

/* -------------------- Activity log -------------------- */

function logActivity(message) {
  state.activity.push({
    message: String(message),
    time: new Date().toLocaleTimeString()
  });

  renderActivity();
}

function renderActivity() {
  const container = $("activity");
  container.replaceChildren();

  if (state.activity.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Agent activity will appear here.";
    container.appendChild(empty);
    return;
  }

  for (const item of state.activity) {
    const wrapper = document.createElement("div");
    wrapper.className = "activity-item";

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = item.time;

    const message = document.createElement("p");
    message.textContent = item.message;

    wrapper.append(time, message);
    container.appendChild(wrapper);
  }
}

function setStatus(message, mode = "") {
  $("status").textContent = message;
  $("status").className = "status" + (mode ? " " + mode : "");
}

/* -------------------- Task board -------------------- */

function renderTasks() {
  const container = $("tasks");
  container.replaceChildren();

  if (state.tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Tasks created by the agent will appear here.";
    container.appendChild(empty);
    return;
  }

  for (const task of state.tasks) {
    const card = document.createElement("div");
    card.className = "task" + (task.completed ? " completed" : "");

    const top = document.createElement("div");
    top.className = "task-top";

    const title = document.createElement("h3");
    title.textContent = task.title;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", "Complete " + task.title);

    checkbox.addEventListener("change", () => {
      task.completed = checkbox.checked;
      renderTasks();

      logActivity(
        (task.completed ? "Completed: " : "Reopened: ") + task.title
      );
    });

    top.append(title, checkbox);

    const description = document.createElement("p");
    description.textContent = task.description;

    const meta = document.createElement("div");
    meta.className = "task-meta";

    const priority = document.createElement("span");
    priority.className = "tag " + task.priority;
    priority.textContent = task.priority.toUpperCase() + " PRIORITY";

    const hours = document.createElement("span");
    hours.className = "tag";
    hours.textContent = task.hours + " hour(s)";

    const day = document.createElement("span");
    day.className = "tag";
    day.textContent = "DAY " + task.day;

    meta.append(priority, hours, day);
    card.append(top, description, meta);
    container.appendChild(card);
  }
}

/* -------------------- Report -------------------- */

function setReport(text) {
  state.report = String(text || "");

  const report = $("report");
  report.classList.remove("empty");
  report.textContent = state.report || "No report generated.";
}

/* -------------------- Agent tool definitions -------------------- */

function getToolDefinitions() {
  return [
    {
      type: "function",
      name: "create_tasks",
      description:
        "Create actionable study tasks for the user's goal. " +
        "Keep task hours within the daily limit and schedule within the horizon.",
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
                hours: { type: "number" },
                priority: {
                  type: "string",
                  enum: ["high", "medium", "low"]
                },
                day: { type: "integer" }
              },
              required: [
                "title",
                "description",
                "hours",
                "priority",
                "day"
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
      description: "Inspect all current tasks and their completion status.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "prioritize_tasks",
      description:
        "Sort unfinished study tasks by importance, urgency and prerequisites.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" }
        },
        required: ["reason"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "reflect_progress",
      description:
        "Review the plan and report gaps, risks and recommended adjustments.",
      parameters: {
        type: "object",
        properties: {
          reflection: { type: "string" }
        },
        required: ["reflection"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "write_report",
      description: "Save the final study plan report.",
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
}

/* -------------------- Tool execution -------------------- */

function normaliseTask(raw, index, horizon) {
  const rawPriority = String(raw.priority || "medium").toLowerCase();

  const priority = ["high", "medium", "low"].includes(rawPriority)
    ? rawPriority
    : "medium";

  const requestedHours = Number(raw.hours);
  const requestedDay = Number(raw.day);

  return {
    id: "task-" + Date.now() + "-" + index,
    title: String(raw.title || "Study task").slice(0, 160),
    description: String(raw.description || "").slice(0, 1200),
    hours:
      Number.isFinite(requestedHours) && requestedHours > 0
        ? Math.min(requestedHours, 24)
        : 1,
    priority,
    day: Number.isFinite(requestedDay)
      ? Math.max(1, Math.min(Math.floor(requestedDay), horizon))
      : 1,
    completed: false
  };
}

function executeTool(name, args, horizon, dailyHours) {
  switch (name) {
    case "create_tasks": {
      if (!Array.isArray(args.tasks)) {
        throw new Error("create_tasks requires a tasks array.");
      }

      if (args.tasks.length > 60) {
        throw new Error("Maximum 60 tasks per creation call.");
      }

      const proposed = args.tasks.map((task, index) =>
        normaliseTask(task, index, horizon)
      );

      const dailyTotals = new Map();

      for (const task of proposed) {
        dailyTotals.set(
          task.day,
          (dailyTotals.get(task.day) || 0) + task.hours
        );
      }

      const overloadedDays = [...dailyTotals.entries()]
        .filter(([, total]) => total > dailyHours + 0.001)
        .map(([day]) => day);

      state.tasks = proposed;
      renderTasks();

      logActivity(
        "create_tasks: created " + proposed.length + " task(s)."
      );

      if (overloadedDays.length) {
        logActivity(
          "Schedule warning: daily hour limit exceeded on day(s) " +
          overloadedDays.join(", ") + "."
        );
      }

      return {
        success: true,
        taskCount: proposed.length,
        overloadedDays,
        dailyHourLimit: dailyHours,
        message: overloadedDays.length
          ? "Some days exceed the limit. Revise the plan."
          : "Tasks created successfully."
      };
    }

    case "list_tasks": {
      const tasks = state.tasks.map((task) => ({
        title: task.title,
        description: task.description,
        hours: task.hours,
        priority: task.priority,
        day: task.day,
        completed: task.completed
      }));

      logActivity("list_tasks: inspected " + tasks.length + " task(s).");

      return {
        count: tasks.length,
        tasks
      };
    }

    case "prioritize_tasks": {
      const rank = { high: 0, medium: 1, low: 2 };

      state.tasks.sort((a, b) => {
        if (a.completed !== b.completed) {
          return Number(a.completed) - Number(b.completed);
        }

        return rank[a.priority] - rank[b.priority] || a.day - b.day;
      });

      renderTasks();
      logActivity("prioritize_tasks: " + String(args.reason));

      return {
        success: true,
        reason: String(args.reason),
        order: state.tasks.map((task) => ({
          title: task.title,
          priority: task.priority,
          day: task.day,
          completed: task.completed
        }))
      };
    }

    case "reflect_progress": {
      const total = state.tasks.length;
      const completed = state.tasks.filter(
        (task) => task.completed
      ).length;

      const result = {
        reflection: String(args.reflection),
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: total - completed,
        completionRate: total
          ? Math.round((completed / total) * 100)
          : 0
      };

      logActivity(
        "reflect_progress: " + completed + "/" + total + " complete."
      );

      return result;
    }

    case "write_report": {
      setReport(args.report);
      logActivity("write_report: final report generated.");

      return {
        success: true,
        reportLength: String(args.report).length
      };
    }

    default:
      throw new Error("Unknown tool: " + name);
  }
}

/* -------------------- Gemini API -------------------- */

async function callGemini(apiKey, input, previousInteractionId) {
  const payload = {
    model: MODEL,
    tools: getToolDefinitions(),
    input
  };

  // Continuation requires a stored interaction.
  if (previousInteractionId) {
    payload.previous_interaction_id = previousInteractionId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Gemini returned a non-JSON response.");
    }

    if (!response.ok) {
      throw new Error(
        data?.error?.message || "Gemini API error: HTTP " + response.status
      );
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Gemini timed out after 60 seconds. Check your API access and network."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getFunctionCalls(data) {
  const steps = Array.isArray(data.steps) ? data.steps : [];

  return steps.filter(
    (step) => step && step.type === "function_call"
  );
}

function getTextFromResponse(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const pieces = [];

  for (const step of Array.isArray(data.steps) ? data.steps : []) {
    if (typeof step?.text === "string" && step.text.trim()) {
      pieces.push(step.text.trim());
    }

    if (Array.isArray(step?.content)) {
      for (const part of step.content) {
        if (typeof part?.text === "string") {
          pieces.push(part.text);
        }
      }
    }
  }

  return pieces.join("\n").trim();
}

/* -------------------- Main agent loop -------------------- */

async function runAgent() {
  if (state.running) return;

  const apiKey = GEMINI_API_KEY.trim();
  const goal = $("goal").value.trim();
  const dailyHours = Number($("hours").value);
  const horizon = Number($("days").value);

  if (
    !apiKey ||
    apiKey === "PASTE_YOUR_NEW_API_KEY_HERE"
  ) {
    alert("Add your Gemini API key near the top of app.js.");
    return;
  }

  if (!goal) {
    alert("Enter a study goal first.");
    $("goal").focus();
    return;
  }

  if (
    !Number.isFinite(dailyHours) ||
    dailyHours < 1 ||
    dailyHours > 12
  ) {
    alert("Available hours must be between 1 and 12.");
    return;
  }

  if (
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 30
  ) {
    alert("Planning horizon must be between 1 and 30 days.");
    return;
  }

  state.running = true;
  state.tasks = [];
  state.activity = [];
  state.report = "";

  renderTasks();
  renderActivity();

  $("report").textContent = "The agent is working...";
  $("report").classList.add("empty");

  $("runAgent").disabled = true;
  $("runAgent").textContent = "Agent running...";
  setStatus("Running", "running");

  logActivity("Starting ORBIT agent.");
  logActivity("Connecting to " + MODEL + ".");

  const instructions = `
You are ORBIT, an autonomous study-planning agent.

USER GOAL:
${goal}

CONSTRAINTS:
- Available hours per day: ${dailyHours}.
- Planning horizon: ${horizon} days.

MANDATORY WORKFLOW:
1. Analyse the goal and identify topics, dependencies and deliverables.
2. Call create_tasks to make concrete, actionable tasks.
3. Check overloadedDays in the tool result. If any day exceeds the daily limit, revise the plan with create_tasks.
4. Call list_tasks to inspect the created plan.
5. Call prioritize_tasks to order tasks by importance and urgency.
6. Call reflect_progress to identify gaps, risks and improvements.
7. Call write_report to save a readable final report.

RULES:
- Actually call the tools; do not claim actions that were not performed.
- Keep tasks within the planning horizon.
- Keep daily hours realistic and within the stated limit.
- Do not claim the user has completed work when only a plan exists.
- Include a day-by-day schedule, priorities, risks and next actions in the report.
- Finish the required tool workflow before giving a short final response.
`;

  let previousInteractionId = null;
  let input = instructions;
  let finished = false;
  const maxIterations = 12;

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      logActivity("Agent reasoning cycle " + (iteration + 1) + ".");

      const data = await callGemini(
        apiKey,
        input,
        previousInteractionId
      );

      if (data.id) {
        previousInteractionId = data.id;
      }

      const calls = getFunctionCalls(data);

      if (calls.length === 0) {
        const text = getTextFromResponse(data);

        if (text && !state.report) {
          setReport(text);
        }

        if (!state.report) {
          setReport(
            text || "The agent stopped without generating a report."
          );
        }

        logActivity("Agent returned its final response.");
        finished = true;
        break;
      }

      const functionResults = [];

      for (const call of calls) {
        const name = call.name;
        let args = call.arguments;

        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            throw new Error("Invalid arguments returned for " + name + ".");
          }
        }

        if (!args || typeof args !== "object" || Array.isArray(args)) {
          throw new Error("Invalid arguments returned for " + name + ".");
        }

        if (!call.id) {
          throw new Error("Gemini returned a tool call without an ID.");
        }

        logActivity("Agent requested tool: " + name + ".");

        let result;

        try {
          result = executeTool(name, args, horizon, dailyHours);
        } catch (error) {
          result = {
            success: false,
            error: error.message
          };

          logActivity(name + " failed: " + error.message);
        }

        functionResults.push({
          type: "function_result",
          name,
          call_id: call.id,
          result: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        });
      }

      input = functionResults;
    }

    if (!finished) {
      throw new Error(
        "The agent reached its reasoning limit. Try a simpler goal."
      );
    }

    if (state.tasks.length === 0) {
      logActivity("Warning: no tasks were created.");
    }

    setStatus("Complete");
    logActivity("ORBIT agent run finished.");

  } catch (error) {
    console.error("ORBIT error:", error);

    setStatus("Error", "error");
    logActivity("Error: " + error.message);

    if (!state.report) {
      setReport(
        "The agent encountered an error:\n\n" +
        error.message +
        "\n\nCheck your API key, model availability and browser console."
      );
    }

    alert("ORBIT error:\n" + error.message);

  } finally {
    state.running = false;
    $("runAgent").disabled = false;
    $("runAgent").textContent = "✦ Run agent";
  }
}

/* -------------------- Event handlers -------------------- */

$("runAgent").addEventListener("click", runAgent);

$("clearTasks").addEventListener("click", () => {
  if (state.running) return;

  state.tasks = [];
  renderTasks();
  logActivity("Task board cleared.");
});

$("copyReport").addEventListener("click", async () => {
  if (!state.report) {
    alert("There is no report to copy yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(state.report);
    $("copyReport").textContent = "Copied!";
  } catch {
    alert("Clipboard access failed. Select and copy the report manually.");
  }
});

/* -------------------- Initial render -------------------- */

renderActivity();
renderTasks();
