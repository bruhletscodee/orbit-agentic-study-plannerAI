"use strict";

/*
 * ORBIT — Agentic Study Planner
 * Gemini Interactions API + executable agent tools.
 */

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.8-flash";

// Paste your Gemini API key between these quotes.
const GEMINI_API_KEY = "AQ.Ab8RN6KQ3Csm0pOl9njJdsRAZQXLXs9rH_ywKUDGySfQP7ZkBA";

const state = {
  tasks: [],
  activity: [],
  report: "",
  running: false
};

const $ = (id) => document.getElementById(id);

function logActivity(message) {
  const item = {
    message: String(message),
    time: new Date().toLocaleTimeString()
  };

  state.activity.push(item);
  renderActivity();
}

function renderActivity() {
  const container = $("activity");

  if (!state.activity.length) {
    container.innerHTML =
      '<p class="empty">Agent activity will appear here.</p>';
    return;
  }

  container.replaceChildren();

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

function renderTasks() {
  const container = $("tasks");
  container.replaceChildren();

  if (!state.tasks.length) {
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
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute("aria-label", "Mark " + task.title + " complete");

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

    const duration = document.createElement("span");
    duration.className = "tag";
    duration.textContent = task.hours + " hour(s)";

    const day = document.createElement("span");
    day.className = "tag";
    day.textContent = "DAY " + task.day;

    meta.append(priority, duration, day);
    card.append(top, description, meta);
    container.appendChild(card);
  }
}

function setStatus(text, mode = "") {
  const status = $("status");
  status.textContent = text;
  status.className = "status" + (mode ? " " + mode : "");
}

function setReport(text) {
  state.report = String(text || "");
  const report = $("report");
  report.classList.remove("empty");
  report.textContent = state.report || "No report generated yet.";
}

function getToolDefinitions() {
  return [
    {
      type: "function",
      name: "create_tasks",
      description:
        "Create structured study tasks for the user's goal. " +
        "Keep the schedule within the available hours and planning horizon.",
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
      description: "List current study tasks and completion status.",
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
        "Prioritize unfinished tasks by urgency, importance and prerequisites.",
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
        "Record a reflection on task completion, gaps and recommended adjustments.",
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
      description: "Write the final study plan report.",
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

function normaliseTask(raw, index, horizon) {
  const priority = ["high", "medium", "low"].includes(
    String(raw.priority).toLowerCase()
  )
    ? String(raw.priority).toLowerCase()
    : "medium";

  const requestedDay = Number(raw.day);
  const requestedHours = Number(raw.hours);

  return {
    id: "task-" + Date.now() + "-" + index,
    title: String(raw.title || "Study task").slice(0, 160),
    description: String(raw.description || "").slice(0, 1200),
    hours:
      Number.isFinite(requestedHours) && requestedHours > 0
        ? Math.min(requestedHours, 24)
        : 1,
    priority,
    day:
      Number.isFinite(requestedDay)
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
        throw new Error("The agent cannot create more than 60 tasks at once.");
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
        .filter(([, hours]) => hours > dailyHours + 0.001)
        .map(([day]) => day);

      state.tasks = proposed;
      renderTasks();

      const result = {
        success: true,
        taskCount: state.tasks.length,
        overloadedDays,
        dailyHourLimit: dailyHours,
        message: overloadedDays.length
          ? "Tasks created, but the listed days exceed the daily hour limit. Adjust the plan."
          : "Tasks created successfully."
      };

      logActivity(
        "Tool create_tasks: created " + proposed.length + " task(s)."
      );

      if (overloadedDays.length) {
        logActivity(
          "Schedule warning: daily hour limit exceeded on day(s): " +
          overloadedDays.join(", ") + "."
        );
      }

      return result;
    }

    case "list_tasks": {
      const result = state.tasks.map((task) => ({
        title: task.title,
        description: task.description,
        hours: task.hours,
        priority: task.priority,
        day: task.day,
        completed: task.completed
      }));

      logActivity("Tool list_tasks: inspected " + result.length + " task(s).");

      return {
        count: result.length,
        tasks: result
      };
    }

    case "prioritize_tasks": {
      const priorityRank = { high: 0, medium: 1, low: 2 };

      state.tasks.sort((a, b) => {
        if (a.completed !== b.completed) {
          return Number(a.completed) - Number(b.completed);
        }

        return (
          priorityRank[a.priority] - priorityRank[b.priority] ||
          a.day - b.day
        );
      });

      renderTasks();
      logActivity("Tool prioritize_tasks: " + String(args.reason));

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
      const completed = state.tasks.filter((task) => task.completed).length;
      const pending = total - completed;

      const result = {
        reflection: String(args.reflection),
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: pending,
        completionRate: total
          ? Math.round((completed / total) * 100)
          : 0
      };

      logActivity(
        "Tool reflect_progress: " +
        completed + "/" + total + " tasks completed."
      );

      return result;
    }

    case "write_report": {
      setReport(args.report);
      logActivity("Tool write_report: final report generated.");

      return {
        success: true,
        reportLength: String(args.report).length
      };
    }

    default:
      throw new Error("Unknown tool requested: " + name);
  }
}

async function callGemini(apiKey, input, previousInteractionId) {
  const payload = {
    model: MODEL,
    tools: getToolDefinitions(),
    input: input
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

  let data;
  const responseText = await response.text();

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      "Gemini returned HTTP " + response.status +
      " with a non-JSON response: " + responseText.slice(0, 800)
    );
  }

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      responseText ||
      ("HTTP " + response.status);

    throw new Error(
      "Gemini API error (HTTP " + response.status + "): " +
      String(detail).slice(0, 1200)
    );
  }

  return data;
}

function getFunctionCalls(data) {
  const steps = Array.isArray(data.steps) ? data.steps : [];

  return steps.filter((step) =>
    step && step.type === "function_call"
  );
}

function getTextFromResponse(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const steps = Array.isArray(data.steps) ? data.steps : [];
  const pieces = [];

  for (const step of steps) {
    if (!step) continue;

    if (
      typeof step.text === "string" &&
      step.text.trim()
    ) {
      pieces.push(step.text.trim());
    }

    if (
      step.type === "text" &&
      typeof step.content === "string" &&
      step.content.trim()
    ) {
      pieces.push(step.content.trim());
    }

    if (Array.isArray(step.content)) {
      for (const part of step.content) {
        if (part && typeof part.text === "string") {
          pieces.push(part.text);
        }
      }
    }
  }

  return pieces.join("\n").trim();
}

async function runAgent() {
  if (state.running) return;

  const apiKey = GEMINI_API_KEY.trim();
  const goal = $("goal").value.trim();
  const dailyHours = Number($("hours").value);
  const horizon = Number($("days").value);

  if (!apiKey || apiKey === "PASTE_YOUR_GEMINI_API_KEY_HERE") {
    alert("Open app.js and paste your Gemini API key into GEMINI_API_KEY first.");
    return;
  }

  if (!goal) {
    alert("Describe the goal you want the agent to plan.");
    $("goal").focus();
    return;
  }

  if (
    !Number.isFinite(dailyHours) ||
    dailyHours < 1 ||
    dailyHours > 12
  ) {
    alert("Available hours per day must be between 1 and 12.");
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
  logActivity("Goal received. Connecting to " + MODEL + ".");

  const systemInstructions = `
You are ORBIT, an autonomous study-planning agent.

OBJECTIVE:
Create a useful, realistic, structured study plan for the user's goal.

USER CONSTRAINTS:
- Available hours per day: ${dailyHours}.
- Planning horizon: ${horizon} days.
- User goal: ${goal}

MANDATORY AGENT WORKFLOW:
1. Analyse the goal and identify the topics, dependencies, and deliverables.
2. Call create_tasks to create concrete tasks distributed across the planning horizon.
3. Keep the total planned task hours on each day within ${dailyHours} hours. If a tool reports overloadedDays, fix the plan by calling create_tasks again.
4. Call list_tasks to inspect the created tasks.
5. Call prioritize_tasks to organise tasks by importance and urgency.
6. Call reflect_progress to identify risks, missing coverage, and improvements.
7. Call write_report to save a readable final report.

RULES:
- Do not claim you called a tool unless you actually called it.
- Use the tools, not merely a prose description of the workflow.
- Every task must be specific and actionable.
- Respect the user's time constraints.
- Do not claim that studying has been completed when only a plan has been created.
- The report should include the goal, day-by-day schedule, priorities, risks, and next actions.
- If you receive an overloaded-day warning, correct it before producing the final report.
- After all required tools have succeeded, provide a short final summary.
`;

  let previousInteractionId = null;
  let input = systemInstructions;
  const maxIterations = 12;
  let finished = false;

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

      if (!calls.length) {
        const text = getTextFromResponse(data);

        if (text) {
          logActivity("Agent returned its response.");

          if (!state.report) {
            setReport(text);
          }
        }

        if (!state.report) {
          setReport(
            text ||
            "The agent stopped without generating a report. Please try again."
          );
        }

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
            throw new Error(
              "Gemini returned invalid arguments for tool " + name + "."
            );
          }
        }

        if (!args || typeof args !== "object" || Array.isArray(args)) {
          throw new Error(
            "Gemini returned invalid arguments for tool " + name + "."
          );
        }

        logActivity("Agent requested tool: " + name + ".");

        let result;

        try {
          result = executeTool(name, args, horizon, dailyHours);
        } catch (toolError) {
          result = {
            success: false,
            error: toolError.message
          };

          logActivity(
            "Tool " + name + " returned an error: " + toolError.message
          );
        }

        functionResults.push({
          type: "function_result",
          name: name,
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
        "The agent reached its maximum number of reasoning cycles. " +
        "Please try again with a simpler goal."
      );
    }

    if (!state.tasks.length) {
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
        "\n\nCheck your API key, model availability, and browser console."
      );
    }

    alert("ORBIT encountered an error:\n" + error.message);

  } finally {
    state.running = false;
    $("runAgent").disabled = false;
    $("runAgent").textContent = "✦ Run agent";
  }
}

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

    setTimeout(() => {
      $("copyReport").textContent = "Copy report";
    }, 1500);
  } catch {
    alert("Clipboard access failed. Select and copy the report manually.");
  }
});

renderActivity();
renderTasks();
