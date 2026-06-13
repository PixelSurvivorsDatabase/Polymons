import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution";
import "monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution";
import { useEffect, useRef } from "react";
import {
  analyzePolyScript,
  type PolyDiagnostic,
  type PolyProject,
  type PolyScript,
} from "../../src/game/polyProject";

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

let configured = false;

function configureMonaco() {
  if (configured) return;
  configured = true;
  monaco.languages.register({ id: "poly-luau" });
  monaco.languages.setLanguageConfiguration("poly-luau", {
    comments: { lineComment: "--", blockComment: ["--[[", "]]"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider("poly-luau", {
    keywords: [
      "and",
      "break",
      "do",
      "else",
      "elseif",
      "end",
      "false",
      "for",
      "function",
      "if",
      "in",
      "local",
      "nil",
      "not",
      "or",
      "repeat",
      "return",
      "then",
      "true",
      "until",
      "while",
    ],
    builtins: [
      "Workspace",
      "workspace",
      "Players",
      "PlayerGui",
      "ReplicatedStorage",
      "DataStoreService",
      "CollectionService",
      "Modules",
      "Module",
      "Vector2",
      "Vector3",
      "print",
      "warn",
    ],
    tokenizer: {
      root: [
        [/--\[\[/, "comment", "@comment"],
        [/--.*$/, "comment"],
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@keywords": "keyword",
            "@builtins": "type.identifier",
            "@default": "identifier",
          },
        }],
        [/\d+(?:\.\d+)?/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@stringDouble"],
        [/'/, "string", "@stringSingle"],
        [/[{}()[\]]/, "@brackets"],
        [/[=><~?:&|+\-*/%^.]+/, "operator"],
      ],
      comment: [
        [/[^\]]+/, "comment"],
        [/\]\]/, "comment", "@pop"],
        [/./, "comment"],
      ],
      stringDouble: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      stringSingle: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
    },
  });
  monaco.editor.defineTheme("poly-studio", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "C792EA" },
      { token: "type.identifier", foreground: "82AAFF" },
      { token: "identifier", foreground: "D5D0DE" },
      { token: "string", foreground: "C3E88D" },
      { token: "number", foreground: "F78C6C" },
      { token: "comment", foreground: "686176", fontStyle: "italic" },
      { token: "operator", foreground: "89DDFF" },
    ],
    colors: {
      "editor.background": "#09090D",
      "editor.foreground": "#D5D0DE",
      "editorLineNumber.foreground": "#514C59",
      "editorLineNumber.activeForeground": "#9D91AA",
      "editor.selectionBackground": "#51347A66",
      "editor.inactiveSelectionBackground": "#3A294F55",
      "editorCursor.foreground": "#B78CFF",
      "editorIndentGuide.background1": "#25212D",
      "editorIndentGuide.activeBackground1": "#493A5D",
    },
  });
}

function markers(diagnostics: PolyDiagnostic[]): monaco.editor.IMarkerData[] {
  return diagnostics.map((diagnostic) => ({
    severity:
      diagnostic.severity === "error"
        ? monaco.MarkerSeverity.Error
        : monaco.MarkerSeverity.Warning,
    message: diagnostic.message,
    source: "Poly Script Analysis",
    startLineNumber: diagnostic.line,
    startColumn: diagnostic.column,
    endLineNumber: diagnostic.line,
    endColumn: diagnostic.endColumn,
  }));
}

export default function CodeEditor({
  script,
  project,
  onChange,
  onDiagnostics,
}: {
  script: StudioScript;
  project: StudioProject;
  onChange: (source: string) => void;
  onDiagnostics: (diagnostics: PolyDiagnostic[]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onDiagnosticsRef = useRef(onDiagnostics);
  const projectRef = useRef(project);
  const scriptRef = useRef(script);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const externalUpdate = useRef(false);
  const scriptId = script.id;
  onChangeRef.current = onChange;
  onDiagnosticsRef.current = onDiagnostics;
  projectRef.current = project;
  scriptRef.current = script;

  useEffect(() => {
    configureMonaco();
    if (!container.current) return;
    const language =
      project.language === "luau" ? "poly-luau" : project.language;
    const extension =
      project.language === "luau"
        ? "luau"
        : project.language === "csharp"
          ? "cs"
          : "cpp";
    const model = monaco.editor.createModel(
      scriptRef.current.source,
      language,
      monaco.Uri.parse(`inmemory://poly/${scriptId}.${extension}`),
    );
    modelRef.current = model;
    const editor = monaco.editor.create(container.current, {
      model,
      theme: "poly-studio",
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 21,
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: {
        showWords: false,
        snippetsPreventQuickSuggestions: false,
        localityBonus: true,
      },
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      tabCompletion: "on",
      snippetSuggestions: "top",
      wordBasedSuggestions: "off",
    });

    const updateDiagnostics = (source: string) => {
      const nextScript = { ...scriptRef.current, source } as PolyScript;
      const diagnostics = analyzePolyScript(
        nextScript,
        projectRef.current as PolyProject,
      );
      monaco.editor.setModelMarkers(model, "poly-script-analysis", markers(diagnostics));
      onDiagnosticsRef.current(diagnostics);
    };
    updateDiagnostics(scriptRef.current.source);

    const changeSubscription = model.onDidChangeContent(() => {
      const source = model.getValue();
      if (!externalUpdate.current) onChangeRef.current(source);
      updateDiagnostics(source);
    });
    const completionSubscription = monaco.languages.registerCompletionItemProvider(
      language,
      {
        triggerCharacters: [".", ":", '"'],
        provideCompletionItems(currentModel, position) {
          if (currentModel !== model) return { suggestions: [] };
          const word = currentModel.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          const names = [
            ...projectRef.current.objects.map((object) => object.name),
            ...projectRef.current.gui.map((object) => object.name),
            ...projectRef.current.remotes.map((remote) => remote.name),
          ];
          const properties = [
            "Position",
            "Rotation",
            "Size",
            "Color",
            "Anchored",
            "Transparency",
            "Material",
            "Texture",
            "CanCollide",
            "CastShadow",
            "Friction",
            "Restitution",
            "Mass",
            "Velocity",
            "Visible",
            "Text",
            "TextColor",
            "BackgroundColor",
            "BackgroundTransparency",
            "TextSize",
            "BorderRadius",
            "ZIndex",
            "WalkSpeed",
            "JumpPower",
            "CameraFieldOfView",
            "CameraMinZoomDistance",
            "CameraMaxZoomDistance",
            "Health",
            "MaxHealth",
            "SprintEnabled",
            "SprintMultiplier",
            "SetAttribute",
            "GetAttribute",
            "FireServer",
            "FireClient",
            "FireAllClients",
            "InvokeServer",
            "InvokeClient",
            "OnServerEvent",
            "OnServerInvoke",
            "OnClientEvent",
            "InputBegan",
            "InputEnded",
            "KeyCode",
            "TweenService",
            "TweenInfo",
            "Touched",
            "TouchEnded",
            ...projectRef.current.leaderstats.map((stat) => stat.name),
          ];
          const isLuau = projectRef.current.language === "luau";
          const isCpp = projectRef.current.language === "cpp";
          const findLabel = isLuau
            ? "Workspace:FindFirstChild"
            : "Workspace.Find";
          const findText = isLuau
            ? 'Workspace:FindFirstChild("${1:Part}")'
            : 'Workspace.Find("${1:Part}")';
          const requireLabel = isLuau
            ? "require"
            : isCpp
              ? "Modules::Require"
              : "Modules.Require";
          const requireText = isLuau
            ? 'require("${1:ModuleScript}")'
            : isCpp
              ? 'Modules::Require("${1:ModuleScript}")'
              : 'Modules.Require("${1:ModuleScript}")';
          const dataStoreLabel = isLuau
            ? "DataStoreService:GetDataStore"
            : isCpp
              ? "DataStoreService::GetDataStore"
              : "DataStoreService.GetDataStore";
          const dataStoreText = isLuau
            ? 'DataStoreService:GetDataStore("${1:PlayerData}")'
            : isCpp
              ? 'DataStoreService::GetDataStore("${1:PlayerData}")'
              : 'DataStoreService.GetDataStore("${1:PlayerData}")';
          const vectorText = isLuau
            ? "Vector3.new(${1:0}, ${2:0}, ${3:0})"
            : isCpp
              ? "Vector3(${1:0}, ${2:0}, ${3:0})"
              : "new Vector3(${1:0}, ${2:0}, ${3:0})";
          const remoteFindText = isLuau
            ? 'ReplicatedStorage:FindFirstChild("${1:RemoteEvent}")'
            : 'ReplicatedStorage.Find("${1:RemoteEvent}")';
          const attributeText = isLuau
            ? '${1:part}:SetAttribute("${2:Health}", ${3:100})'
            : '${1:part}.SetAttribute("${2:Health}", ${3:100})';
          const tagText = isLuau
            ? 'CollectionService:AddTag(${1:part}, "${2:Enemy}")'
            : isCpp
              ? 'CollectionService::AddTag(${1:part}, "${2:Enemy}")'
              : 'CollectionService.AddTag(${1:part}, "${2:Enemy}")';
          const localPlayerText = isCpp
            ? "Players::LocalPlayer"
            : "Players.LocalPlayer";
          const leaderstatText = isLuau
            ? 'Leaderstats:Add(Players.LocalPlayer, "${1:Coins}", ${2:1})'
            : isCpp
              ? 'Leaderstats::Add(Players::LocalPlayer, "${1:Coins}", ${2:1});'
              : 'Leaderstats.Add(Players.LocalPlayer, "${1:Coins}", ${2:1});';
          const ifText = isLuau
            ? "if ${1:condition} then\n\t${2:-- code}\nend"
            : "if (${1:condition}) {\n\t${2:// code}\n}";
          const functionText = isLuau
            ? "local function ${1:name}(${2})\n\t${3:-- code}\nend"
            : isCpp
              ? "void ${1:name}(${2}) {\n\t${3:// code}\n}"
              : "void ${1:Name}(${2})\n{\n\t${3:// code}\n}";
          const touchedText = isLuau
            ? "${1:part}.Touched:Connect(function(hit)\n\t${2:-- code}\nend)"
            : isCpp
              ? "${1:part}.Touched.Connect([&](auto hit) {\n\t${2:// code}\n});"
              : "${1:part}.Touched += (hit) => {\n\t${2:// code}\n};";
          const touchEndedText = touchedText.replaceAll("Touched", "TouchEnded");
          const onServerEventText = isLuau
            ? "${1:remote}.OnServerEvent:Connect(function(player, ${2:value})\n\t${3:-- server code}\nend)"
            : isCpp
              ? "${1:remote}.OnServerEvent.Connect([&](auto player, auto ${2:value}) {\n\t${3:// server code}\n});"
              : "${1:remote}.OnServerEvent += (player, ${2:value}) => {\n\t${3:// server code}\n};";
          const onServerInvokeText = isLuau
            ? "${1:remote}.OnServerInvoke = function(player, ${2:value})\n\t${3:return nil}\nend"
            : isCpp
              ? "${1:remote}.OnServerInvoke = [&](auto player, auto ${2:value}) {\n\t${3:return nullptr;}\n};"
              : "${1:remote}.OnServerInvoke = (player, ${2:value}) => {\n\t${3:return null;}\n};";
          const onClientEventText = isLuau
            ? "${1:remote}.OnClientEvent:Connect(function(${2:value})\n\t${3:-- client code}\nend)"
            : isCpp
              ? "${1:remote}.OnClientEvent.Connect([&](auto ${2:value}) {\n\t${3:// client code}\n});"
              : "${1:remote}.OnClientEvent += (${2:value}) => {\n\t${3:// client code}\n};";
          const inputBeganText = isLuau
            ? "UserInputService.InputBegan:Connect(function(input)\n\tif input.KeyCode == Enum.KeyCode.${1:E} then\n\t\t${2:-- code}\n\tend\nend)"
            : isCpp
              ? "UserInputService.InputBegan.Connect([&](auto input) {\n\tif (input.KeyCode == KeyCode::${1:E}) {\n\t\t${2:// code}\n\t}\n});"
              : "UserInputService.InputBegan += (input) => {\n\tif (input.KeyCode == KeyCode.${1:E}) {\n\t\t${2:// code}\n\t}\n};";
          const tweenText = isLuau
            ? "local tween = TweenService:Create(${1:part}, TweenInfo.new(${2:1}, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Position = Vector3.new(${3:0}, ${4:5}, ${5:0}) })\ntween:Play()"
            : isCpp
              ? "auto tween = TweenService::Create(${1:part}, TweenInfo(${2:1}, EasingStyle::Quad, EasingDirection::Out), { Position = Vector3(${3:0}, ${4:5}, ${5:0}) });\ntween.Play();"
              : "var tween = TweenService.Create(${1:part}, new TweenInfo(${2:1}, EasingStyle.Quad, EasingDirection.Out), new { Position = new Vector3(${3:0}, ${4:5}, ${5:0}) });\ntween.Play();";
          return {
            suggestions: [
              ...names.map((name) => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: name,
                detail: "Project object",
                range,
              })),
              ...properties.map((property) => ({
                label: property,
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: property,
                detail: "Poly property",
                range,
              })),
              {
                label: findLabel,
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: findText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Find a Workspace object by name",
                range,
              },
              {
                label: localPlayerText,
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: localPlayerText,
                detail: "Current player (LocalScript only)",
                range,
              },
              {
                label: "if block",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: ifText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: `${projectRef.current.language.toUpperCase()} conditional`,
                range,
              },
              {
                label: "function",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: functionText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Function declaration",
                range,
              },
              {
                label: "Activated",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: "Activated",
                detail: "TextButton activation event",
                range,
              },
              {
                label: "MouseButton1Click",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: "MouseButton1Click",
                detail: "TextButton primary click event",
                range,
              },
              {
                label: "Touched event",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: touchedText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Run a server Script when the avatar touches a Part",
                range,
              },
              {
                label: "TouchEnded event",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: touchEndedText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Run a server Script when the avatar stops touching a Part",
                range,
              },
              {
                label: "OnServerEvent callback",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: onServerEventText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Receive FireServer calls in a server Script",
                range,
              },
              {
                label: "OnServerInvoke callback",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: onServerInvokeText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Return a value to InvokeServer from a server Script",
                range,
              },
              {
                label: "OnClientEvent callback",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: onClientEventText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Receive FireClient or FireAllClients in a LocalScript",
                range,
              },
              {
                label: "InputBegan KeyCode",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: inputBeganText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Run LocalScript code when a keyboard key is pressed",
                range,
              },
              {
                label: "TweenService Create",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: tweenText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Tween a Part's transform or appearance",
                range,
              },
              {
                label: "Vector3.new",
                kind: monaco.languages.CompletionItemKind.Constructor,
                insertText: vectorText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
              },
              {
                label: requireLabel,
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: requireText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Load a ModuleScript by name",
                range,
              },
              {
                label: dataStoreLabel,
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: dataStoreText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Open a persistent server data store",
                range,
              },
              {
                label: "Leaderstats.Add",
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: leaderstatText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Add to one selected player's numeric leaderstat",
                range,
              },
              {
                label: "ReplicatedStorage.Find",
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: remoteFindText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Find a RemoteEvent or RemoteFunction",
                range,
              },
              {
                label: "SetAttribute",
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: attributeText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Set custom object data",
                range,
              },
              {
                label: "CollectionService.AddTag",
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: tagText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Tag an object for gameplay systems",
                range,
              },
            ],
          };
        },
      },
    );

    return () => {
      changeSubscription.dispose();
      completionSubscription.dispose();
      monaco.editor.setModelMarkers(model, "poly-script-analysis", []);
      editor.dispose();
      modelRef.current = null;
      model.dispose();
    };
  }, [project.language, scriptId]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || model.getValue() === script.source) return;
    externalUpdate.current = true;
    model.setValue(script.source);
    externalUpdate.current = false;
  }, [script.source]);

  return <div className="monaco-host" ref={container} />;
}
