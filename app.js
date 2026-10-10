"use strict";

/*
 * ORBIT — Agentic Study Planner
 * Gemini Interactions API + executable agent tools.
 *
 * SECURITY:
 * This browser demo sends the API key directly to Google.
 * Never hardcode your API key or commit it to GitHub.
 */

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

const MODEL = "gemini-3.8-flash";

const state = {
  tasks: [],
  activity: [],
  report: "",
  running: false
};

const $ = (id) => document.getElementById(id);

/* --------------------------------------------------
   ACTIVITY LOG
-------------------------------------------------- */

function logActivity(message) {
  state.activity.push({
    message: String(message),
    time: new Date().toLocaleTimeString()
  });

  renderActivity();
}

function renderActivity() {
  const container = $("activity");
  if (!container) return;

  container.replaceChildren();

  if (!state.activity.length) {
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

/* --------------------------------------------------
   TASK BOARD
-------------------------------------------------- */

function renderTasks() {
  const container = $("tasks");
  if (!container) return;

  container.replaceChildren();

  if (!state.tasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "Tasks created by the agent will appear here.";

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
    checkbox.setAttribute(
      "aria-label",
      "Mark " + task.title + " complete"
    );

    checkbox.addEventListener("change", () => {
      task.completed = checkbox.checked;
      renderTasks();

      logActivity(
        (task.completed ? "Completed: " : "Reopened: ") +
        task.title
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

/* --------------------------------------------------
   STATUS AND REPORT
-------------------------------------------------- */

function setStatus(message, mode = "") {
  const status = $("status");
  if (!status) return;

  status.textContent = message;
  status.className = "status" + (mode ? " " + mode : "");
}

function setReport(text) {
  state.report = String(text || "");

  const report = $("report");
  if (!report) return;

  report.classList.remove("empty");
  report.textContent = state.report || "No report generated yet.";
}

/* --------------------------------------------------
   GEMINI FUNCTION TOOL DEFINITIONS
-------------------------------------------------- */

function getToolDefinitions() {
  return [
    {
      type: "function",
      name: "create_tasks",
      description:
        "Create structured study tasks for the user's goal. " +
        "Respect the daily hours and planning horizon.",
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
      description: "List current study tasks and their completion status.",
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
        "Reflect on completion, gaps and recommended adjustments.",
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
      description: "Write and save the final study plan report.",
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

/* --------------------------------------------------
   TASK VALIDATION
-------------------------------------------------- */

function normaliseTask(raw, index, horizon) {
  const allowedPriorities = ["high", "medium", "low"];

  const candidatePriority = String(raw.priority || "").toLowerCase();

  const priority = allowedPriorities.includes(candidatePriority)
    ? candidatePriority
    : "medium";

  const requestedDay = Number(raw.day);
  const requestedHours = Number(raw.hours);

  return {
    id: "task-" + Date.now() + "-" + index,
    title: String(raw.title || "Study task").slice(0, 160),
    description: String(raw.description || "").slice(0, 1200),
    hours:
      Number.isFinite(requestedHours) && requestedHours > 0
        ? Math.min(requestedHours, 12)
        : 1,
    priority,
    day: Number.isFinite(requestedDay)
      ? Math.max(1, Math.min(Math.floor(requestedDay), horizon))
      : 1,
    completed: false
  };
}

/* --------------------------------------------------
   LOCAL TOOL EXECUTION
-------------------------------------------------- */

function executeTool(name, args, horizon, dailyHours) {
  switch (name) {
    case "create_tasks": {
      if (!Array.isArray(args.tasks)) {
        throw new Error("create_tasks requires a tasks array.");
      }

      if (args.tasks.length > 60) {
        throw new Error("A maximum of 60 tasks can be created at once.");
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

      logActivity(
        "Tool create_tasks: created " + proposed.length + " task(s)."
      );

      if (overloadedDays.length) {
        logActivity(
          "Schedule warning: daily hour limit exceeded on day(s): " +
          overloadedDays.join(", ") + "."
        );
      }

      return {
        success: true,
        taskCount: proposed.length,
        overloadedDays,
        dailyHourLimit: dailyHours,
        message: overloadedDays.length
          ? "Some days exceed the daily hour limit. Revise the schedule."
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

      logActivity(
        "Tool list_tasks: inspected " + tasks.length + " task(s)."
      );

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

        return (
          rank[a.priority] - rank[b.priority] ||
          a.day - b.day
        );
      });

      renderTasks();

      logActivity(
        "Tool prioritize_tasks: " + String(args.reason || "")
      );

      return {
        success: true,
        reason: String(args.reason || ""),
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

      const pending = total - completed;

      const result = {
        reflection: String(args.reflection || ""),
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
      setReport(args.report || "");

      logActivity("Tool write_report: final report generated.");

      return {
        success: true,
        reportLength: String(args.report || "").length
      };
    }

    default:
      throw new Error("Unknown tool requested: " + name);
  }
}

/* --------------------------------------------------
   GEMINI API REQUEST
-------------------------------------------------- */

async function callGemini(apiKey, input, previousInteractionId) {
  const payload = {
    model: MODEL,
    tools: getToolDefinitions(),
    input
  };

  /*
   * Do not set store:false here.
   * The agent uses previous_interaction_id to continue the interaction.
   */

  if (previousInteractionId) {
    payload.previous_interaction_id = previousInteractionId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  let response;

  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Gemini request timed out after 60 seconds. Try again."
      );
    }

    throw new Error(
      "Could not connect to Gemini. Check your internet connection. " +
      error.message
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    if (!response.ok) {
      throw new Error(
        "Gemini HTTP " + response.status +
        ". Response: " + responseText.slice(0, 1200)
      );
    }

    throw new Error(
      "Gemini returned an invalid JSON response: " +
      responseText.slice(0, 500)
    );
  }

  /*
   * This exposes Google's actual error message, such as:
   * invalid API key, API not enabled, or key restriction failure.
   */
  if (!response.ok) {
    console.error("Gemini API response:", data);

    const detail = data?.error?.message || responseText;

    throw new Error(
      "Gemini API error: HTTP " +
      response.status + " — " + String(detail).slice(0, 1500)
    );
  }

  return data;
}

/* --------------------------------------------------
   RESPONSE PARSING
-------------------------------------------------- */

function getFunctionCalls(data) {
  const steps = Array.isArray(data.steps) ? data.steps : [];

  return steps.filter(
    (step) => step && step.type === "function_call"
  );
}

function getTextFromResponse(data) {
  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const pieces = [];
  const steps = Array.isArray(data.steps) ? data.steps : [];

  for (const step of steps) {
    if (!step) continue;

    if (typeof step.text === "string" && step.text.trim()) {
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

/* --------------------------------------------------
   MAIN AGENT LOOP
-------------------------------------------------- */

async function runAgent() {
  if (state.running) return;

  const apiKeyInput = $("apiKey");
  const goalInput = $("goal");
  const hoursInput = $("hours");
  const daysInput = $("days");

  if (!apiKeyInput || !goalInput || !hoursInput || !daysInput) {
    alert(
      "ORBIT could not find one or more required HTML fields. " +
      "Check that your HTML contains apiKey, goal, hours and days."
    );
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  const goal = goalInput.value.trim();
  const dailyHours = Number(hoursInput.value);
  const horizon = Number(daysInput.value);

  if (!apiKey) {
    alert("Enter your Gemini API key first.");
    apiKeyInput.focus();
    return;
  }

  if (!goal) {
    alert("Describe the goal you want the agent to plan.");
    goalInput.focus();
    return;
  }

  if (goal.length > 1000) {
    alert("Please limit your goal to 1,000 characters.");
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

  if ($("report")) {
    $("report").textContent = "The agent is working...";
    $("report").classList.add("empty");
  }

  const runButton = $("runAgent");

  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = "Agent running...";
  }

  setStatus("Running", "running");

  logActivity("Starting ORBIT agent.");
  logActivity("Connecting to " + MODEL + ".");

  const systemInstructions = `
You are ORBIT, an autonomous study-planning agent.

USER GOAL:
${goal}

CONSTRAINTS:
- Available study hours per day: ${dailyHours}.
- Planning horizon: ${horizon} days.
- Do not exceed the daily hour limit.

MANDATORY WORKFLOW:
1. Analyse the goal, topics, prerequisites and deliverables.
2. Call create_tasks to create concrete study tasks.
3. Ensure each day stays within ${dailyHours} hours.
4. If overloadedDays is non-empty, call create_tasks again with a corrected plan.
5. Call list_tasks to inspect the plan.
6. Call prioritize_tasks to organize the tasks.
7. Call reflect_progress to identify gaps and improvements.
8. Call write_report to save the final report.

RULES:
- Actually call the tools. Do not merely describe tool use.
- Each task must be specific and actionable.
- Distribute tasks across the ${horizon}-day planning horizon.
- Include revision, practice and assessment when appropriate.
- Do not claim that the user has completed studying.
- The final report must include the goal, schedule, priorities, risks and next actions.
- After all required tools succeed, provide a short final response.
`;

  let previousInteractionId = null;
  let input = systemInstructions;
  const maxIterations = 12;
  let finished = false;

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      logActivity(
        "Agent reasoning cycle " + (iteration + 1) + "."
      );

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
        const responseText = getTextFromResponse(data);

        if (responseText) {
          logActivity("Agent returned its response.");

          if (!state.report) {
            setReport(responseText);
          }
        }

        if (!state.report) {
          setReport(
            responseText ||
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

        if (
          !args ||
          typeof args !== "object" ||
          Array.isArray(args)
        ) {
          throw new Error(
            "Gemini returned invalid arguments for tool " + name + "."
          );
        }

        if (!call.id) {
          throw new Error(
            "Gemini returned a function call without a call ID."
          );
        }

        logActivity("Agent requested tool: " + name + ".");

        let result;

        try {
          result = executeTool(
            name,
            args,
            horizon,
            dailyHours
          );
        } catch (toolError) {
          result = {
            success: false,
            error: toolError.message
          };

          logActivity(
            "Tool " + name + " error: " + toolError.message
          );
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
        "The agent reached its maximum of " +
        maxIterations +
        " reasoning cycles. Try a simpler goal."
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
        "\n\nCheck the API key, key restrictions, model availability, " +
        "and browser console."
      );
    }

    alert("ORBIT encountered an error:\n\n" + error.message);

  } finally {
    state.running = false;

    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = "✦ Run agent";
    }
  }
}

/* --------------------------------------------------
   EVENT LISTENERS
-------------------------------------------------- */

if ($("runAgent")) {
  $("runAgent").addEventListener("click", runAgent);
}

if ($("toggleKey") && $("apiKey")) {
  $("toggleKey").addEventListener("click", () => {
    const key = $("apiKey");
    const visible = key.type === "password";

    key.type = visible ? "text" : "password";
    $("toggleKey").textContent = visible ? "Hide" : "Show";
  });
}

if ($("clearTasks")) {
  $("clearTasks").addEventListener("click", () => {
    if (state.running) return;

    state.tasks = [];
    renderTasks();
    logActivity("Task board cleared.");
  });
}

if ($("copyReport")) {
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
      alert(
        "Clipboard access failed. Select and copy the report manually."
      );
    }
  });
}

/* --------------------------------------------------
   INITIAL RENDER
-------------------------------------------------- */

renderActivity();
renderTasks();
