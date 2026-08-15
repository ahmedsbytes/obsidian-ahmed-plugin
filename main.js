"use strict";

const { Modal, Notice, Plugin, Setting, TFile } = require("obsidian");

const DEFAULT_SETTINGS = Object.freeze({
  boardPath: "00 Home/Tasks Board.md",
  defaultStatus: "Backlog",
  projectFolder: "20 Projects/",
});

function normalizeTaskText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProjectFolder(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value) ||
    /^[A-Za-z]:\//.test(value)
  ) {
    throw new Error("Invalid project folder setting.");
  }

  const withoutTrailingSlash = value.endsWith("/") ? value.slice(0, -1) : value;
  const segments = withoutTrailingSlash.split("/");
  if (
    !withoutTrailingSlash ||
    segments.some(
      (segment) =>
        !segment ||
        segment.trim() !== segment ||
        segment === "." ||
        segment === "..",
    )
  ) {
    throw new Error("Invalid project folder setting.");
  }

  return `${withoutTrailingSlash}/`;
}

function isSafeRelativeFilePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value) ||
    /^[A-Za-z]:\//.test(value)
  ) {
    return false;
  }

  return value
    .split("/")
    .every(
      (segment) =>
        segment &&
        segment.trim() === segment &&
        segment !== "." &&
        segment !== "..",
    );
}

function buildTaskLine(taskText, projectLink) {
  const normalized = normalizeTaskText(taskText);
  if (!normalized) throw new Error("Task text cannot be empty.");
  if (
    typeof projectLink !== "string" ||
    !projectLink ||
    projectLink.trim() !== projectLink ||
    /[\r\n]/.test(projectLink)
  ) {
    throw new Error("Project link must be one non-empty Markdown link.");
  }
  return `- [ ] ${normalized} · ${projectLink}`;
}

function isIndentedCodeLine(line) {
  let column = 0;
  for (const character of line) {
    if (character === " ") {
      column += 1;
    } else if (character === "\t") {
      column += 4 - (column % 4);
    } else {
      break;
    }
    if (column >= 4) return true;
  }
  return false;
}

function getOpeningFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return { character: match[1][0], length: match[1].length };
}

function isClosingFence(line, fence) {
  const match = /^ {0,3}([^\s].*)$/.exec(line);
  if (!match) return false;

  const content = match[1];
  let runLength = 0;
  while (content[runLength] === fence.character) runLength += 1;
  return runLength >= fence.length && /^[ \t]*$/.test(content.slice(runLength));
}

function updateHtmlCommentState(line, inComment) {
  let cursor = 0;
  let commentOpen = inComment;
  while (cursor < line.length) {
    const marker = commentOpen ? "-->" : "<!--";
    const markerIndex = line.indexOf(marker, cursor);
    if (markerIndex === -1) break;
    commentOpen = !commentOpen;
    cursor = markerIndex + marker.length;
  }
  return commentOpen;
}

function getLevelTwoHeadingText(line) {
  const match = /^ {0,3}##(?!#)(?:[ \t]+(.*))?$/.exec(line);
  if (!match) return null;
  return (match[1] || "").replace(/[ \t]+#+[ \t]*$/, "").trim();
}

function findLaneHeadingIndexes(lines, status) {
  const indexes = [];
  const firstLine = (lines[0] || "").replace(/^\uFEFF/, "");
  let inFrontmatter = /^---[ \t]*$/.test(firstLine);
  let fence = null;
  let inHtmlComment = false;

  lines.forEach((originalLine, index) => {
    const line =
      index === 0 ? originalLine.replace(/^\uFEFF/, "") : originalLine;

    if (inFrontmatter) {
      if (index > 0 && /^(?:---|\.\.\.)[ \t]*$/.test(line)) {
        inFrontmatter = false;
      }
      return;
    }

    if (fence) {
      if (isClosingFence(line, fence)) fence = null;
      return;
    }

    if (inHtmlComment) {
      inHtmlComment = updateHtmlCommentState(line, true);
      return;
    }

    if (isIndentedCodeLine(line)) return;

    const openingFence = getOpeningFence(line);
    if (openingFence) {
      fence = openingFence;
      return;
    }

    const commentStart = line.indexOf("<!--");
    const headingCandidate =
      commentStart === -1 ? line : line.slice(0, commentStart);
    inHtmlComment = updateHtmlCommentState(line, false);

    if (getLevelTwoHeadingText(headingCandidate) === status) {
      indexes.push(index);
    }
  });

  return indexes;
}

function insertTaskIntoLane(boardText, status, taskLine) {
  if (typeof boardText !== "string")
    throw new Error("Board content must be text.");
  const normalizedStatus = normalizeTaskText(status);
  if (!normalizedStatus) throw new Error("Task status cannot be empty.");
  if (
    typeof taskLine !== "string" ||
    /[\r\n]/.test(taskLine) ||
    !taskLine.startsWith("- [ ] ")
  ) {
    throw new Error("Task card must be one unchecked Markdown task line.");
  }

  const eol = boardText.includes("\r\n") ? "\r\n" : "\n";
  const lines = boardText.split(/\r?\n/);
  const headingIndexes = findLaneHeadingIndexes(lines, normalizedStatus);

  if (headingIndexes.length !== 1) {
    throw new Error(
      `Expected exactly one ${normalizedStatus} lane; found ${headingIndexes.length}.`,
    );
  }

  let insertIndex = headingIndexes[0] + 1;
  while (insertIndex < lines.length && lines[insertIndex].trim() === "")
    insertIndex += 1;
  lines.splice(insertIndex, 0, taskLine);
  return lines.join(eol);
}

class AddProjectTaskModal extends Modal {
  constructor(app, projectName, defaultStatus, onSubmit) {
    super(app);
    this.projectName = projectName;
    this.defaultStatus = defaultStatus;
    this.onSubmitTask = onSubmit;
    this.taskText = "";
    this.submitting = false;
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: `Add task to ${this.projectName}` });
    this.contentEl.createEl("p", {
      text: `The new card will be added to Tasks Board → ${this.defaultStatus}.`,
    });

    new Setting(this.contentEl).setName("Task").addText((text) => {
      text.setPlaceholder("What needs to be done?");
      text.onChange((value) => {
        this.taskText = value;
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void this.submit();
        }
      });
      setTimeout(() => text.inputEl.focus(), 0);
    });

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText(`Add to ${this.defaultStatus}`);
        button.setCta();
        button.onClick(() => void this.submit());
      })
      .addButton((button) => {
        button.setButtonText("Cancel");
        button.onClick(() => this.close());
      });
  }

  async submit() {
    if (this.submitting) return;
    const normalized = normalizeTaskText(this.taskText);
    if (!normalized) {
      new Notice("Enter a task first.");
      return;
    }

    this.submitting = true;
    try {
      await this.onSubmitTask(normalized);
      this.close();
    } catch (error) {
      console.error(
        "Ahmed's Obsidian Tools: Project Task Capture failed",
        error,
      );
      new Notice("Could not add the task. The Tasks Board was not changed.");
    } finally {
      this.submitting = false;
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class AhmedObsidianPlugin extends Plugin {
  async onload() {
    const settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) || {},
    );
    settings.projectFolder = normalizeProjectFolder(settings.projectFolder);
    this.settings = settings;

    this.registerMarkdownCodeBlockProcessor(
      "project-task-add",
      (_source, el, ctx) => {
        const button = el.createEl("button", {
          text: "＋ Add task",
          cls: "project-task-capture-button",
        });

        if (!this.isProjectPath(ctx.sourcePath)) {
          button.disabled = true;
          button.setAttr(
            "title",
            "This action is available only on project pages.",
          );
          return;
        }

        this.registerDomEvent(button, "click", () =>
          this.openTaskModal(ctx.sourcePath),
        );
      },
    );

    this.addCommand({
      id: "add-task-to-current-project",
      name: "Add task to current project",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.isProjectPath(file.path)) return false;
        if (!checking) this.openTaskModal(file.path);
        return true;
      },
    });
  }

  isProjectPath(sourcePath) {
    let projectFolder;
    try {
      projectFolder = normalizeProjectFolder(this.settings.projectFolder);
    } catch {
      return false;
    }

    return (
      isSafeRelativeFilePath(sourcePath) &&
      sourcePath.startsWith(projectFolder) &&
      sourcePath.endsWith(".md")
    );
  }

  openTaskModal(sourcePath) {
    const projectName = sourcePath.slice(sourcePath.lastIndexOf("/") + 1, -3);
    new AddProjectTaskModal(
      this.app,
      projectName,
      this.settings.defaultStatus,
      (taskText) => this.addTask(sourcePath, taskText),
    ).open();
  }

  async addTask(sourcePath, taskText) {
    if (!this.isProjectPath(sourcePath))
      throw new Error("Invalid project path.");

    const projectFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (
      !(projectFile instanceof TFile) ||
      projectFile.extension !== "md" ||
      projectFile.path !== sourcePath ||
      !projectFile.basename
    ) {
      throw new Error("Project note not found.");
    }

    if (
      !isSafeRelativeFilePath(this.settings.boardPath) ||
      !this.settings.boardPath.endsWith(".md")
    ) {
      throw new Error("Tasks Board not found.");
    }
    const boardFile = this.app.vault.getAbstractFileByPath(
      this.settings.boardPath,
    );
    if (
      !(boardFile instanceof TFile) ||
      boardFile.extension !== "md" ||
      boardFile.path !== this.settings.boardPath
    ) {
      throw new Error("Tasks Board not found.");
    }

    const projectLink = this.app.fileManager.generateMarkdownLink(
      projectFile,
      boardFile.path,
      undefined,
      projectFile.basename,
    );
    const taskLine = buildTaskLine(taskText, projectLink);
    await this.app.vault.process(boardFile, (boardText) =>
      insertTaskIntoLane(boardText, this.settings.defaultStatus, taskLine),
    );
    new Notice(`Task added to ${this.settings.defaultStatus}.`);
  }
}

module.exports = AhmedObsidianPlugin;
module.exports.__test = {
  AddProjectTaskModal,
  buildTaskLine,
  insertTaskIntoLane,
  normalizeProjectFolder,
  normalizeTaskText,
};
