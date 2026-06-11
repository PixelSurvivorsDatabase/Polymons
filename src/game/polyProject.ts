export type PolyLanguage = "luau" | "cpp" | "csharp";
export type PolyScriptKind = "script" | "localScript";
export type PolyScriptParent =
  | "ServerScriptService"
  | "StarterPlayerScripts"
  | string;

export type PolyWorldObject = {
  id: string;
  name: string;
  type: "baseplate" | "spawn" | "part";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  anchored: boolean;
  visible?: boolean;
};

export type PolyGuiObject = {
  id: string;
  name: string;
  type: "screenGui" | "frame" | "textLabel" | "textButton";
  parentId: string | null;
  position: [number, number];
  size: [number, number];
  backgroundColor: string;
  backgroundTransparency: number;
  text: string;
  textColor: string;
  visible: boolean;
};

export type PolyScript = {
  id: string;
  name: string;
  kind: PolyScriptKind;
  parent: PolyScriptParent;
  source: string;
};

export type PolyPlayerSettings = {
  walkSpeed: number;
  jumpPower: number;
};

export type PolyProject = {
  version: 2;
  id: string;
  name: string;
  language: PolyLanguage;
  createdAt: string;
  updatedAt: string;
  objects: PolyWorldObject[];
  scripts: PolyScript[];
  gui: PolyGuiObject[];
  playerSettings: PolyPlayerSettings;
};

export type PolyDiagnostic = {
  line: number;
  column: number;
  endColumn: number;
  severity: "error" | "warning";
  message: string;
};

export type PolyRuntimeResult = {
  project: PolyProject;
  diagnostics: Array<PolyDiagnostic & { scriptId: string; scriptName: string }>;
  output: Array<{
    level: "info" | "warning" | "error";
    message: string;
    scriptName: string;
  }>;
};

type Reference =
  | { kind: "world"; id: string }
  | { kind: "gui"; id: string }
  | { kind: "player"; id: "LocalPlayer" };

const WORLD_PROPERTIES = new Set([
  "Name",
  "Position",
  "Rotation",
  "Size",
  "Color",
  "Anchored",
  "Visible",
]);
const GUI_PROPERTIES = new Set([
  "Name",
  "Position",
  "Size",
  "BackgroundColor",
  "BackgroundTransparency",
  "Text",
  "TextColor",
  "Visible",
]);
const PLAYER_PROPERTIES = new Set(["WalkSpeed", "JumpPower"]);

function cloneProject(project: PolyProject): PolyProject {
  return structuredClone(project);
}

function lineDiagnostic(
  line: number,
  source: string,
  message: string,
  severity: PolyDiagnostic["severity"] = "error",
): PolyDiagnostic {
  const first = Math.max(0, source.search(/\S/));
  return {
    line,
    column: first + 1,
    endColumn: Math.max(first + 2, source.length + 1),
    severity,
    message,
  };
}

function referenceByName(
  project: PolyProject,
  container: "Workspace" | "PlayerGui",
  name: string,
): Reference | null {
  if (container === "Workspace") {
    const object = project.objects.find((item) => item.name === name);
    return object ? { kind: "world", id: object.id } : null;
  }
  const gui = project.gui.find((item) => item.name === name);
  return gui ? { kind: "gui", id: gui.id } : null;
}

function findReferenceDeclaration(
  source: string,
  project: PolyProject,
): { variable: string; reference: Reference | null; requestedName: string } | null {
  const objectMatch =
    source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*(Workspace|workspace|PlayerGui)(?::FindFirstChild|\.Find)\(\s*["']([^"']+)["']\s*\)\s*;?/,
    ) ??
    source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*(Workspace|workspace|PlayerGui)\.([A-Za-z_]\w*)\s*;?/,
    );
  if (objectMatch) {
    const container =
      objectMatch[2].toLowerCase() === "workspace" ? "Workspace" : "PlayerGui";
    return {
      variable: objectMatch[1],
      reference: referenceByName(project, container, objectMatch[3]),
      requestedName: objectMatch[3],
    };
  }

  const playerMatch = source.match(
    /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*Players(?:\.|::)LocalPlayer\s*;?/,
  );
  if (playerMatch) {
    return {
      variable: playerMatch[1],
      reference: { kind: "player", id: "LocalPlayer" },
      requestedName: "LocalPlayer",
    };
  }
  return null;
}

function findDirectReference(
  expression: string,
  project: PolyProject,
): Reference | null {
  const direct = expression.match(
    /^(Workspace|workspace|PlayerGui)\.([A-Za-z_]\w*)$/,
  );
  if (direct) {
    return referenceByName(
      project,
      direct[1].toLowerCase() === "workspace" ? "Workspace" : "PlayerGui",
      direct[2],
    );
  }
  if (/^Players(?:\.|::)LocalPlayer$/.test(expression)) {
    return { kind: "player", id: "LocalPlayer" };
  }
  return null;
}

function parseNumbers(value: string, count: number): number[] | null {
  const constructor = value.match(
    /(?:Vector[23](?:::new|\.new)?|new\s+Vector[23])\s*\(([^)]+)\)/i,
  );
  if (!constructor) return null;
  const numbers = constructor[1]
    .split(",")
    .map((part) => Number(part.trim()))
    .filter(Number.isFinite);
  return numbers.length === count ? numbers : null;
}

function parseString(value: string): string | null {
  const match = value.trim().match(/^["'](.*)["']\s*;?$/);
  return match ? match[1] : null;
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().replace(/;$/, "").toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(/;$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function propertySetFor(reference: Reference): Set<string> {
  if (reference.kind === "world") return WORLD_PROPERTIES;
  if (reference.kind === "gui") return GUI_PROPERTIES;
  return PLAYER_PROPERTIES;
}

function assignProperty(
  project: PolyProject,
  reference: Reference,
  property: string,
  rawValue: string,
): string | null {
  if (!propertySetFor(reference).has(property)) {
    return `${property} is not a supported property for this object.`;
  }

  if (reference.kind === "world") {
    const object = project.objects.find((item) => item.id === reference.id);
    if (!object) return "The referenced Workspace object no longer exists.";
    if (property === "Name") {
      const value = parseString(rawValue);
      if (value === null) return "Name must be a string.";
      object.name = value;
    } else if (property === "Color") {
      const value = parseString(rawValue);
      if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
        return 'Color must be a hex string such as "#7a4cff".';
      }
      object.color = value;
    } else if (property === "Anchored") {
      const value = parseBoolean(rawValue);
      if (value === null) return "Anchored must be true or false.";
      object.anchored = value;
    } else if (property === "Visible") {
      const value = parseBoolean(rawValue);
      if (value === null) return "Visible must be true or false.";
      object.visible = value;
    } else {
      const value = parseNumbers(rawValue, 3);
      if (!value) return `${property} must be Vector3.new(x, y, z).`;
      const vector = value as [number, number, number];
      if (property === "Position") object.position = vector;
      if (property === "Rotation") object.rotation = vector;
      if (property === "Size") object.scale = vector;
    }
    return null;
  }

  if (reference.kind === "gui") {
    const gui = project.gui.find((item) => item.id === reference.id);
    if (!gui) return "The referenced PlayerGui object no longer exists.";
    if (["Name", "Text", "BackgroundColor", "TextColor"].includes(property)) {
      const value = parseString(rawValue);
      if (value === null) return `${property} must be a string.`;
      if (
        ["BackgroundColor", "TextColor"].includes(property) &&
        !/^#[0-9a-f]{6}$/i.test(value)
      ) {
        return `${property} must be a hex color string.`;
      }
      if (property === "Name") gui.name = value;
      if (property === "Text") gui.text = value;
      if (property === "BackgroundColor") gui.backgroundColor = value;
      if (property === "TextColor") gui.textColor = value;
    } else if (property === "Visible") {
      const value = parseBoolean(rawValue);
      if (value === null) return "Visible must be true or false.";
      gui.visible = value;
    } else if (property === "BackgroundTransparency") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0 || value > 1) {
        return "BackgroundTransparency must be between 0 and 1.";
      }
      gui.backgroundTransparency = value;
    } else {
      const value = parseNumbers(rawValue, 2);
      if (!value) return `${property} must be Vector2.new(x, y).`;
      const vector = value as [number, number];
      if (property === "Position") gui.position = vector;
      if (property === "Size") gui.size = vector;
    }
    return null;
  }

  const value = parseNumber(rawValue);
  if (value === null || value <= 0 || value > 500) {
    return `${property} must be a positive number no greater than 500.`;
  }
  if (property === "WalkSpeed") project.playerSettings.walkSpeed = value;
  if (property === "JumpPower") project.playerSettings.jumpPower = value;
  return null;
}

function delimiterDiagnostics(source: string): PolyDiagnostic[] {
  const diagnostics: PolyDiagnostic[] = [];
  const stack: Array<{ value: string; line: number; column: number }> = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let line = 1;
  let column = 0;
  let quote: string | null = null;
  let escaped = false;

  for (const character of source) {
    column += 1;
    if (character === "\n") {
      line += 1;
      column = 0;
      quote = null;
      escaped = false;
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) {
      stack.push({ value: character, line, column });
    } else if (")]}".includes(character)) {
      const opening = stack.pop();
      if (!opening || opening.value !== pairs[character]) {
        diagnostics.push({
          line,
          column,
          endColumn: column + 1,
          severity: "error",
          message: `Unexpected '${character}'.`,
        });
      }
    }
  }
  for (const opening of stack) {
    diagnostics.push({
      line: opening.line,
      column: opening.column,
      endColumn: opening.column + 1,
      severity: "error",
      message: `Missing closing delimiter for '${opening.value}'.`,
    });
  }
  return diagnostics;
}

function syntaxDiagnostics(
  script: PolyScript,
  language: PolyLanguage,
): PolyDiagnostic[] {
  const diagnostics: PolyDiagnostic[] = [];
  const lines = script.source.split("\n");

  lines.forEach((source, index) => {
    const trimmed = source.trim();
    if (/=\s*;?$/.test(trimmed) && !/[=!<>]=\s*;?$/.test(trimmed)) {
      diagnostics.push(
        lineDiagnostic(index + 1, source, "Expected a value after '='."),
      );
    }
    if (
      language !== "luau" &&
      trimmed &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("#") &&
      !trimmed.endsWith(";") &&
      !trimmed.endsWith("{") &&
      !trimmed.endsWith("}") &&
      /^(?:var|auto|const\s+auto|[A-Za-z_]\w*(?:\.|::))/.test(trimmed)
    ) {
      diagnostics.push(
        lineDiagnostic(index + 1, source, "Expected ';' at the end of this line."),
      );
    }
  });

  if (language !== "luau") return diagnostics;
  const blocks: Array<{ kind: string; line: number; column: number }> = [];
  lines.forEach((source, index) => {
    const code = source.replace(/--.*$/, "").trim();
    if (!code) return;
    if (/^end\b/.test(code)) {
      const opening = blocks.pop();
      if (!opening) {
        diagnostics.push(
          lineDiagnostic(index + 1, source, "Unexpected 'end'."),
        );
      }
      return;
    }
    if (/^until\b/.test(code)) {
      const opening = blocks.pop();
      if (!opening || opening.kind !== "repeat") {
        diagnostics.push(
          lineDiagnostic(index + 1, source, "Unexpected 'until'."),
        );
      }
      return;
    }
    let kind: string | null = null;
    if (/^(?:local\s+)?function\b/.test(code)) kind = "function";
    else if (/^if\b.*\bthen\s*$/.test(code)) kind = "if";
    else if (/^(?:for|while)\b.*\bdo\s*$/.test(code)) kind = "loop";
    else if (/^repeat\b/.test(code)) kind = "repeat";
    if (kind) {
      blocks.push({
        kind,
        line: index + 1,
        column: Math.max(1, source.search(/\S/) + 1),
      });
    }
  });
  for (const block of blocks) {
    diagnostics.push({
      line: block.line,
      column: block.column,
      endColumn: block.column + block.kind.length,
      severity: "error",
      message:
        block.kind === "repeat"
          ? "This repeat block is missing 'until'."
          : `This ${block.kind} block is missing 'end'.`,
    });
  }
  return diagnostics;
}

export function analyzePolyScript(
  script: PolyScript,
  project: PolyProject,
): PolyDiagnostic[] {
  const diagnostics = [
    ...delimiterDiagnostics(script.source),
    ...syntaxDiagnostics(script, project.language),
  ];
  const validationProject = cloneProject(project);
  const variables = new Map<string, Reference>();
  const lines = script.source.split("\n");

  lines.forEach((source, index) => {
    const line = index + 1;
    const trimmed = source.trim();
    if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("//")) return;

    const declaration = findReferenceDeclaration(source, project);
    if (declaration) {
      if (!declaration.reference) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            `No object named "${declaration.requestedName}" exists in that container.`,
          ),
        );
      } else {
        variables.set(declaration.variable, declaration.reference);
        if (
          script.kind === "script" &&
          (declaration.reference.kind === "gui" ||
            declaration.reference.kind === "player")
        ) {
          diagnostics.push(
            lineDiagnostic(
              line,
              source,
              "Server scripts cannot access PlayerGui or Players.LocalPlayer.",
            ),
          );
        }
      }
      return;
    }

    const assignment = source.match(
      /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
    );
    if (assignment) {
      const reference =
        variables.get(assignment[1]) ??
        findDirectReference(assignment[1], project);
      if (!reference) {
        if (
          assignment[1].startsWith("Workspace.") ||
          assignment[1].startsWith("workspace.") ||
          assignment[1].startsWith("PlayerGui.")
        ) {
          diagnostics.push(
            lineDiagnostic(line, source, `Could not resolve ${assignment[1]}.`),
          );
        }
        return;
      }
      if (
        script.kind === "script" &&
        (reference.kind === "gui" || reference.kind === "player")
      ) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            "Server scripts cannot change client-only objects.",
          ),
        );
        return;
      }
      if (!propertySetFor(reference).has(assignment[2])) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            `${assignment[2]} is not a supported property for this object.`,
          ),
        );
      } else {
        const valueError = assignProperty(
          validationProject,
          reference,
          assignment[2],
          assignment[3],
        );
        if (valueError) {
          diagnostics.push(lineDiagnostic(line, source, valueError));
        }
      }
    }
  });

  if (
    script.kind === "localScript" &&
    script.parent === "ServerScriptService"
  ) {
    diagnostics.push({
      line: 1,
      column: 1,
      endColumn: 2,
      severity: "error",
      message: "LocalScripts do not run in ServerScriptService.",
    });
  }
  if (
    script.kind === "script" &&
    script.parent === "StarterPlayerScripts"
  ) {
    diagnostics.push({
      line: 1,
      column: 1,
      endColumn: 2,
      severity: "error",
      message: "Server Scripts do not run in StarterPlayerScripts.",
    });
  }
  return diagnostics;
}

function outputCall(source: string): { level: "info" | "warning"; text: string } | null {
  const match = source.match(
    /^\s*(print|warn|Poly\.Log|Poly\.Warn|Console::(?:Log|Warn))\s*\(\s*["'](.*)["']\s*\)\s*;?\s*$/,
  );
  if (!match) return null;
  return {
    level: /warn/i.test(match[1]) ? "warning" : "info",
    text: match[2],
  };
}

function executeScript(
  script: PolyScript,
  project: PolyProject,
  output: PolyRuntimeResult["output"],
): void {
  const variables = new Map<string, Reference>();
  for (const source of script.source.split("\n")) {
    const declaration = findReferenceDeclaration(source, project);
    if (declaration?.reference) {
      variables.set(declaration.variable, declaration.reference);
      continue;
    }
    const logged = outputCall(source);
    if (logged) {
      output.push({
        level: logged.level,
        message: logged.text,
        scriptName: script.name,
      });
      continue;
    }
    const assignment = source.match(
      /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
    );
    if (!assignment) continue;
    const reference =
      variables.get(assignment[1]) ??
      findDirectReference(assignment[1], project);
    if (!reference) continue;
    const error = assignProperty(
      project,
      reference,
      assignment[2],
      assignment[3],
    );
    if (error) {
      output.push({ level: "error", message: error, scriptName: script.name });
    }
  }
}

export function runPolyProject(input: PolyProject): PolyRuntimeResult {
  const project = cloneProject(input);
  const diagnostics = project.scripts.flatMap((script) =>
    analyzePolyScript(script, project).map((diagnostic) => ({
      ...diagnostic,
      scriptId: script.id,
      scriptName: script.name,
    })),
  );
  const output: PolyRuntimeResult["output"] = [];

  for (const script of project.scripts.filter((item) => item.kind === "script")) {
    if (
      !diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      executeScript(script, project, output);
    }
  }
  for (const script of project.scripts.filter(
    (item) => item.kind === "localScript",
  )) {
    if (
      !diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      executeScript(script, project, output);
    }
  }

  return { project, diagnostics, output };
}
