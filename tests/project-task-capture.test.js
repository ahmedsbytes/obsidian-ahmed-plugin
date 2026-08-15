"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

class FakePlugin {
  constructor() {
    this.loadedData = null;
    this.registeredCommands = [];
    this.registeredEvents = [];
    this.registeredProcessors = [];
  }

  async loadData() {
    return this.loadedData;
  }

  registerMarkdownCodeBlockProcessor(name, callback) {
    this.registeredProcessors.push({ callback, name });
  }

  registerDomEvent(element, event, handler) {
    this.registeredEvents.push({ element, event, handler });
  }

  addCommand(command) {
    this.registeredCommands.push(command);
  }
}

class FakeElement {
  constructor() {
    this.children = [];
    this.settings = [];
    this.textComponents = [];
    this.buttons = [];
  }

  empty() {
    this.children = [];
    this.settings = [];
    this.textComponents = [];
    this.buttons = [];
  }

  createEl(tag, options = {}) {
    const child = { options, tag };
    this.children.push(child);
    return child;
  }
}

class FakeModal {
  constructor(app) {
    this.app = app;
    this.contentEl = new FakeElement();
  }

  open() {
    this.opened = true;
    this.onOpen();
  }

  close() {
    this.closed = true;
    this.onClose();
  }
}

class FakeSetting {
  constructor(element) {
    this.element = element;
    this.element.settings.push(this);
  }

  setName(name) {
    this.name = name;
    return this;
  }

  addText(callback) {
    const inputEl = {
      listeners: {},
      addEventListener(event, handler) {
        this.listeners[event] = handler;
      },
      focus() {
        this.focused = true;
      },
    };
    const text = {
      inputEl,
      onChange(handler) {
        this.changeHandler = handler;
        return this;
      },
      setPlaceholder(placeholder) {
        this.placeholder = placeholder;
        return this;
      },
    };
    this.element.textComponents.push(text);
    callback(text);
    return this;
  }

  addButton(callback) {
    const button = {
      onClick(handler) {
        this.clickHandler = handler;
        return this;
      },
      setButtonText(label) {
        this.label = label;
        return this;
      },
      setCta() {
        this.cta = true;
        return this;
      },
    };
    this.element.buttons.push(button);
    callback(button);
    return this;
  }
}

class FakeTFile {
  constructor(path, extension) {
    this.path = path;
    const filename = path.slice(path.lastIndexOf("/") + 1);
    const lastDot = filename.lastIndexOf(".");
    this.extension =
      extension === undefined
        ? lastDot === -1
          ? ""
          : filename.slice(lastDot + 1)
        : extension;
    this.basename = lastDot === -1 ? filename : filename.slice(0, lastDot);
  }
}

class FakeNotice {
  static messages = [];

  constructor(message) {
    FakeNotice.messages.push(message);
  }
}

const originalLoad = Module._load;
Module._load = function mockObsidian(request, parent, isMain) {
  if (request === "obsidian") {
    return {
      Modal: FakeModal,
      Notice: FakeNotice,
      Plugin: FakePlugin,
      Setting: FakeSetting,
      TFile: FakeTFile,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let PluginClass;
try {
  PluginClass = require("../main.js");
} finally {
  Module._load = originalLoad;
}

const {
  AddProjectTaskModal,
  buildTaskLine,
  insertTaskIntoLane,
  normalizeProjectFolder,
  normalizeTaskText,
} = PluginClass.__test;

function baseSettings() {
  return {
    boardPath: "00 Home/Tasks Board.md",
    defaultStatus: "Backlog",
    projectFolder: "20 Projects/",
  };
}

function makeButtonHost() {
  const button = {
    disabled: false,
    attributes: {},
    setAttr(name, value) {
      this.attributes[name] = value;
    },
  };

  return {
    button,
    element: {
      createEl(_tag, options) {
        button.options = options;
        return button;
      },
    },
  };
}

test("normalizes task text to one safe Markdown line", () => {
  assert.equal(
    normalizeTaskText("  Ask\r\n the\tinstaller\u0000  "),
    "Ask the installer",
  );
});

test("builds exactly one linked Kanban task card", () => {
  assert.equal(
    buildTaskLine("  Request quote\nsoon ", "[[native project link]]"),
    "- [ ] Request quote soon · [[native project link]]",
  );
  assert.throws(
    () => buildTaskLine(" \n ", "[[native project link]]"),
    /empty/i,
  );
  assert.throws(() => buildTaskLine("Task", "unsafe\nlink"), /link/i);
});

test("inserts a card into an empty Backlog without changing other lanes", () => {
  const before = [
    "---",
    "kanban-plugin: board",
    "---",
    "",
    "## Backlog",
    "",
    "",
    "## To do",
    "",
    "- [ ] Existing",
    "",
    "## Doing",
    "",
  ].join("\n");
  const task = "- [ ] New task · [[20 Projects/Alpha|Alpha]]";
  const after = insertTaskIntoLane(before, "Backlog", task);

  assert.match(after, /## Backlog\n\n\n- \[ \] New task/);
  assert.match(after, /## To do\n\n- \[ \] Existing/);
  assert.equal((after.match(/New task/g) || []).length, 1);
});

test("prepends a new card before existing cards", () => {
  const before = [
    "## Backlog",
    "",
    "- [ ] Existing backlog task",
    "",
    "## To do",
    "",
  ].join("\n");
  const task = "- [ ] New backlog task · [[20 Projects/Alpha|Alpha]]";
  const after = insertTaskIntoLane(before, "Backlog", task);

  assert.ok(
    after.indexOf("New backlog task") < after.indexOf("Existing backlog task"),
  );
});

test("preserves CRLF line endings", () => {
  const before = "## Backlog\r\n\r\n## To do\r\n";
  const after = insertTaskIntoLane(before, "Backlog", "- [ ] New");

  assert.equal(after.replace(/\r\n/g, "").includes("\n"), false);
  assert.match(after, /## Backlog\r\n\r\n- \[ \] New\r\n## To do/);
});

test("fails closed for missing or duplicated target lanes", () => {
  assert.throws(
    () => insertTaskIntoLane("## To do\n", "Backlog", "- [ ] New"),
    /exactly one.*Backlog/i,
  );
  assert.throws(
    () =>
      insertTaskIntoLane("## Backlog\n\n## Backlog\n", "Backlog", "- [ ] New"),
    /exactly one.*Backlog/i,
  );
});

test("rejects fake lanes in frontmatter, fences, comments, and indented code", () => {
  const fakeOnlyBoard = [
    "---",
    "example: |",
    "  ## Backlog",
    "---",
    "",
    "```markdown",
    "## Backlog",
    "```",
    "",
    "   ~~~~markdown",
    "## Backlog",
    "~~~",
    "## Backlog",
    "   ~~~~",
    "",
    "<!--",
    "## Backlog",
    "-->",
    "",
    "    ## Backlog",
    "\t## Backlog",
    "",
  ].join("\n");

  assert.throws(
    () => insertTaskIntoLane(fakeOnlyBoard, "Backlog", "- [ ] New"),
    /exactly one.*Backlog.*found 0/i,
  );
});

test("uses the one structural lane when fake lane examples are also present", () => {
  const board = [
    "---",
    'sample: "## Backlog"',
    "---",
    "",
    "```",
    "## Backlog",
    "```",
    "",
    "<!--",
    "## Backlog",
    "-->",
    "",
    "    ## Backlog",
    "",
    "## Backlog",
    "",
    "- [ ] Existing",
    "",
  ].join("\n");

  const after = insertTaskIntoLane(board, "Backlog", "- [ ] New");
  const realLaneIndex = after.lastIndexOf("## Backlog");

  assert.ok(after.indexOf("- [ ] New") > realLaneIndex);
  assert.ok(after.indexOf("- [ ] New") < after.indexOf("- [ ] Existing"));
  assert.equal((after.match(/- \[ \] New/g) || []).length, 1);
});

test("normalizes a safe project folder and rejects unsafe settings", () => {
  assert.equal(normalizeProjectFolder("20 Projects"), "20 Projects/");
  assert.equal(
    normalizeProjectFolder("20 Projects/Active/"),
    "20 Projects/Active/",
  );

  for (const unsafe of [
    "",
    "/20 Projects",
    "C:/20 Projects",
    ".",
    "../20 Projects",
    "20 Projects/../Secrets",
    "20 Projects//Active",
    "20 Projects\\Active",
    "20 Projects/ Active",
    "20 Projects/ ",
    "20 Projects/\u0000Active",
  ]) {
    assert.throws(() => normalizeProjectFolder(unsafe), /project folder/i);
  }
});

test("loads defaults, registers the code block, and registers the command", async () => {
  const plugin = new PluginClass();
  plugin.loadedData = {
    defaultStatus: "Inbox",
    projectFolder: "20 Projects",
  };
  plugin.app = { workspace: { getActiveFile: () => null } };

  await plugin.onload();

  assert.deepEqual(plugin.settings, {
    boardPath: "00 Home/Tasks Board.md",
    defaultStatus: "Inbox",
    projectFolder: "20 Projects/",
  });
  assert.equal(plugin.registeredProcessors.length, 1);
  assert.equal(plugin.registeredProcessors[0].name, "project-task-add");
  assert.equal(plugin.registeredCommands.length, 1);
  assert.equal(plugin.registeredCommands[0].id, "add-task-to-current-project");
});

test("invalid loaded project folders fail before registration", async () => {
  for (const projectFolder of ["", "/Projects", "Projects/../Secrets"]) {
    const plugin = new PluginClass();
    plugin.loadedData = { projectFolder };
    plugin.app = { workspace: { getActiveFile: () => null } };

    await assert.rejects(plugin.onload(), /project folder/i);
    assert.equal(plugin.registeredProcessors.length, 0);
    assert.equal(plugin.registeredCommands.length, 0);
  }
});

test("project membership uses a canonical path-segment boundary", async () => {
  const plugin = new PluginClass();
  plugin.loadedData = { projectFolder: "20 Projects" };
  plugin.app = { workspace: { getActiveFile: () => null } };
  await plugin.onload();

  assert.equal(plugin.isProjectPath("20 Projects/Alpha.md"), true);
  assert.equal(plugin.isProjectPath("20 Projects/Nested/Alpha.md"), true);
  assert.equal(plugin.isProjectPath("20 Projects-old/Alpha.md"), false);
  assert.equal(plugin.isProjectPath("20 Projects/../Alpha.md"), false);
  assert.equal(plugin.isProjectPath("20 Projects//Alpha.md"), false);
  assert.equal(plugin.isProjectPath("/20 Projects/Alpha.md"), false);
  assert.equal(plugin.isProjectPath("20 Projects/Alpha.canvas"), false);
});

test("disables the button outside projects and opens it inside projects", async () => {
  const plugin = new PluginClass();
  plugin.app = { workspace: { getActiveFile: () => null } };
  await plugin.onload();
  const processor = plugin.registeredProcessors[0].callback;

  const outside = makeButtonHost();
  processor("", outside.element, { sourcePath: "95 Templates/Project.md" });
  assert.equal(outside.button.disabled, true);
  assert.match(
    outside.button.attributes.title,
    /available only on project pages/i,
  );

  let openedPath = null;
  plugin.openTaskModal = (path) => {
    openedPath = path;
  };
  const inside = makeButtonHost();
  processor("", inside.element, {
    sourcePath: "20 Projects/Home Energy Upgrade.md",
  });
  assert.equal(inside.button.disabled, false);
  assert.equal(plugin.registeredEvents.length, 1);
  assert.equal(plugin.registeredEvents[0].event, "click");
  plugin.registeredEvents[0].handler();
  assert.equal(openedPath, "20 Projects/Home Energy Upgrade.md");
});

test("command availability follows the active project note", async () => {
  const plugin = new PluginClass();
  let activeFile = { path: "30 Notes/Random.md" };
  plugin.app = { workspace: { getActiveFile: () => activeFile } };
  await plugin.onload();
  const command = plugin.registeredCommands[0];

  assert.equal(command.checkCallback(true), false);

  activeFile = { path: "20 Projects/German B1.md" };
  assert.equal(command.checkCallback(true), true);

  let openedPath = null;
  plugin.openTaskModal = (path) => {
    openedPath = path;
  };
  assert.equal(command.checkCallback(false), true);
  assert.equal(openedPath, "20 Projects/German B1.md");
});

test("modal primary action names the configured status", () => {
  const modal = new AddProjectTaskModal({}, "Alpha", "Inbox", async () => {});

  modal.open();

  assert.equal(modal.contentEl.buttons[0].label, "Add to Inbox");
  assert.equal(modal.contentEl.buttons[0].cta, true);
});

test("modal empty submit shows a notice without invoking submit", async () => {
  let submitCalls = 0;
  FakeNotice.messages = [];
  const modal = new AddProjectTaskModal({}, "Alpha", "Inbox", async () => {
    submitCalls += 1;
  });

  modal.taskText = " \n\t ";
  await modal.submit();

  assert.equal(submitCalls, 0);
  assert.equal(modal.closed, undefined);
  assert.deepEqual(FakeNotice.messages, ["Enter a task first."]);
});

test("failed modal submit retains input and permits a retry", async (t) => {
  t.mock.method(console, "error", () => {});
  let submitCalls = 0;
  FakeNotice.messages = [];
  const modal = new AddProjectTaskModal({}, "Alpha", "Inbox", async () => {
    submitCalls += 1;
    if (submitCalls === 1) throw new Error("write failed");
  });
  modal.taskText = "Retry this task";

  await modal.submit();

  assert.equal(modal.closed, undefined);
  assert.equal(modal.taskText, "Retry this task");
  assert.equal(modal.submitting, false);
  assert.deepEqual(FakeNotice.messages, [
    "Could not add the task. The Tasks Board was not changed.",
  ]);

  await modal.submit();
  assert.equal(submitCalls, 2);
  assert.equal(modal.closed, true);
});

test("same modal ignores reentrant submits while a write is pending", async () => {
  let finishWrite;
  let submitCalls = 0;
  const pendingWrite = new Promise((resolve) => {
    finishWrite = resolve;
  });
  const modal = new AddProjectTaskModal({}, "Alpha", "Inbox", async () => {
    submitCalls += 1;
    await pendingWrite;
  });
  modal.taskText = "Only once";

  const firstSubmit = modal.submit();
  const secondSubmit = modal.submit();
  assert.equal(submitCalls, 1);

  finishWrite();
  await Promise.all([firstSubmit, secondSubmit]);
  assert.equal(submitCalls, 1);
  assert.equal(modal.closed, true);
});

test("does not touch the board when the source project disappeared", async () => {
  const plugin = new PluginClass();
  let processCalls = 0;
  plugin.settings = baseSettings();
  plugin.app = {
    vault: {
      getAbstractFileByPath(path) {
        if (path === plugin.settings.boardPath) return new FakeTFile(path);
        return null;
      },
      async process() {
        processCalls += 1;
      },
    },
  };

  await assert.rejects(
    plugin.addTask("20 Projects/Deleted Project.md", "Orphan task"),
    /project note.*not found/i,
  );
  assert.equal(processCalls, 0);
});

test("atomically creates one linked Backlog card", async () => {
  const plugin = new PluginClass();
  const projectPath = "20 Projects/Home Energy Upgrade.md";
  const boardPath = "00 Home/Tasks Board.md";
  let boardText = "## Backlog\n\n## To do\n";
  let processCalls = 0;
  const generatedLinkCalls = [];
  FakeNotice.messages = [];

  plugin.settings = baseSettings();
  plugin.app = {
    fileManager: {
      generateMarkdownLink(...args) {
        generatedLinkCalls.push(args);
        return "[[native project link]]";
      },
    },
    vault: {
      getAbstractFileByPath(path) {
        if (path === projectPath || path === boardPath) {
          return new FakeTFile(path);
        }
        return null;
      },
      async process(file, updater) {
        assert.equal(file.path, boardPath);
        processCalls += 1;
        boardText = updater(boardText);
      },
    },
  };

  await plugin.addTask(projectPath, "Ask the installer");

  assert.equal(processCalls, 1);
  assert.equal((boardText.match(/Ask the installer/g) || []).length, 1);
  assert.match(
    boardText,
    /## Backlog\n\n- \[ \] Ask the installer · \[\[native project link\]\]\n## To do/,
  );
  assert.deepEqual(generatedLinkCalls, [
    [new FakeTFile(projectPath), boardPath, undefined, "Home Energy Upgrade"],
  ]);
  assert.deepEqual(FakeNotice.messages, ["Task added to Backlog."]);
});

test("uses Obsidian native link generation for special filename characters", async () => {
  const plugin = new PluginClass();
  const projectPath = "20 Projects/Scope #1 ] | Final.md";
  const boardPath = "00 Home/Tasks Board.md";
  const projectFile = new FakeTFile(projectPath);
  const boardFile = new FakeTFile(boardPath);
  let boardText = "## Backlog\n";
  let generatedArguments;

  plugin.settings = baseSettings();
  plugin.app = {
    fileManager: {
      generateMarkdownLink(...args) {
        generatedArguments = args;
        return "[Scope special](native-generated-target)";
      },
    },
    vault: {
      getAbstractFileByPath(path) {
        if (path === projectPath) return projectFile;
        if (path === boardPath) return boardFile;
        return null;
      },
      async process(_file, updater) {
        boardText = updater(boardText);
      },
    },
  };

  await plugin.addTask(projectPath, "Check scope");

  assert.deepEqual(generatedArguments, [
    projectFile,
    boardFile.path,
    undefined,
    projectFile.basename,
  ]);
  assert.match(
    boardText,
    /- \[ \] Check scope · \[Scope special\]\(native-generated-target\)/,
  );
  assert.doesNotMatch(boardText, /\[\[20 Projects\/Scope/);
});

test("rejects a missing board before the atomic write", async () => {
  const plugin = new PluginClass();
  const projectPath = "20 Projects/Home Energy Upgrade.md";
  let processCalls = 0;
  plugin.settings = baseSettings();
  plugin.app = {
    vault: {
      getAbstractFileByPath(path) {
        if (path === projectPath) return new FakeTFile(path);
        return null;
      },
      async process() {
        processCalls += 1;
      },
    },
  };

  await assert.rejects(plugin.addTask(projectPath, "Task"), /board not found/i);
  assert.equal(processCalls, 0);
});

test("rejects wrong-extension project and board files before writing", async () => {
  const projectPath = "20 Projects/Alpha.md";
  const boardPath = "00 Home/Tasks Board.md";

  for (const wrongFile of ["project", "board"]) {
    const plugin = new PluginClass();
    let processCalls = 0;
    plugin.settings = baseSettings();
    plugin.app = {
      vault: {
        getAbstractFileByPath(path) {
          if (path === projectPath) {
            return new FakeTFile(
              path,
              wrongFile === "project" ? "canvas" : "md",
            );
          }
          if (path === boardPath) {
            return new FakeTFile(path, wrongFile === "board" ? "txt" : "md");
          }
          return null;
        },
        async process() {
          processCalls += 1;
        },
      },
    };

    await assert.rejects(
      plugin.addTask(projectPath, "Task"),
      wrongFile === "project" ? /project note.*not found/i : /board not found/i,
    );
    assert.equal(processCalls, 0);
  }

  const plugin = new PluginClass();
  plugin.settings = baseSettings();
  await assert.rejects(
    plugin.addTask("20 Projects/Alpha.canvas", "Task"),
    /invalid project path/i,
  );
});

test("requires project and board objects to be TFile instances", async () => {
  const projectPath = "20 Projects/Alpha.md";
  const boardPath = "00 Home/Tasks Board.md";

  for (const plainObject of ["project", "board"]) {
    const plugin = new PluginClass();
    let processCalls = 0;
    plugin.settings = baseSettings();
    plugin.app = {
      vault: {
        getAbstractFileByPath(path) {
          if (path === projectPath) {
            return plainObject === "project"
              ? { basename: "Alpha", extension: "md", path }
              : new FakeTFile(path);
          }
          if (path === boardPath) {
            return plainObject === "board"
              ? { basename: "Tasks Board", extension: "md", path }
              : new FakeTFile(path);
          }
          return null;
        },
        async process() {
          processCalls += 1;
        },
      },
    };

    await assert.rejects(
      plugin.addTask(projectPath, "Task"),
      plainObject === "project"
        ? /project note.*not found/i
        : /board not found/i,
    );
    assert.equal(processCalls, 0);
  }
});

test("addTask leaves the board unchanged for missing or duplicate lanes", async () => {
  const projectPath = "20 Projects/Alpha.md";
  const boardPath = "00 Home/Tasks Board.md";

  for (const initialBoard of ["## To do\n", "## Backlog\n\n## Backlog\n"]) {
    const plugin = new PluginClass();
    let boardText = initialBoard;
    plugin.settings = baseSettings();
    plugin.app = {
      fileManager: {
        generateMarkdownLink() {
          return "[[native project link]]";
        },
      },
      vault: {
        getAbstractFileByPath(path) {
          if (path === projectPath || path === boardPath)
            return new FakeTFile(path);
          return null;
        },
        async process(_file, updater) {
          boardText = updater(boardText);
        },
      },
    };

    await assert.rejects(
      plugin.addTask(projectPath, "Task"),
      /exactly one.*Backlog/i,
    );
    assert.equal(boardText, initialBoard);
  }
});

test("manifest, package, versions, and release allowlist stay consistent", () => {
  const manifest = require("../manifest.json");
  const packageJson = require("../package.json");
  const versions = require("../versions.json");

  assert.equal(manifest.id, "obsidian-ahmed-plugin");
  assert.equal(manifest.name, "Ahmed's Obsidian Tools");
  assert.equal(packageJson.name, "obsidian-ahmed-plugin");
  assert.equal(
    packageJson.repository.url,
    "https://github.com/ahmedsbytes/obsidian-ahmed-plugin.git",
  );
  assert.equal(packageJson.version, manifest.version);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
  assert.deepEqual(Object.keys(versions), [manifest.version]);
  assert.deepEqual(packageJson.files, [
    "main.js",
    "manifest.json",
    "styles.css",
  ]);
});
