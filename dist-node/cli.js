#!/usr/bin/env bun
// @bun
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// node_modules/commander/lib/error.js
var require_error = __commonJS((exports) => {
  class CommanderError extends Error {
    constructor(exitCode, code, message) {
      super(message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.code = code;
      this.exitCode = exitCode;
      this.nestedError = undefined;
    }
  }

  class InvalidArgumentError extends CommanderError {
    constructor(message) {
      super(1, "commander.invalidArgument", message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
    }
  }
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Argument {
    constructor(name, description) {
      this.description = description || "";
      this.variadic = false;
      this.parseArg = undefined;
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.argChoices = undefined;
      switch (name[0]) {
        case "<":
          this.required = true;
          this._name = name.slice(1, -1);
          break;
        case "[":
          this.required = false;
          this._name = name.slice(1, -1);
          break;
        default:
          this.required = true;
          this._name = name;
          break;
      }
      if (this._name.length > 3 && this._name.slice(-3) === "...") {
        this.variadic = true;
        this._name = this._name.slice(0, -3);
      }
    }
    name() {
      return this._name;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    argRequired() {
      this.required = true;
      return this;
    }
    argOptional() {
      this.required = false;
      return this;
    }
  }
  function humanReadableArgName(arg) {
    const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
    return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
  }
  exports.Argument = Argument;
  exports.humanReadableArgName = humanReadableArgName;
});

// node_modules/commander/lib/help.js
var require_help = __commonJS((exports) => {
  var { humanReadableArgName } = require_argument();

  class Help {
    constructor() {
      this.helpWidth = undefined;
      this.sortSubcommands = false;
      this.sortOptions = false;
      this.showGlobalOptions = false;
    }
    visibleCommands(cmd) {
      const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
      const helpCommand = cmd._getHelpCommand();
      if (helpCommand && !helpCommand._hidden) {
        visibleCommands.push(helpCommand);
      }
      if (this.sortSubcommands) {
        visibleCommands.sort((a, b) => {
          return a.name().localeCompare(b.name());
        });
      }
      return visibleCommands;
    }
    compareOptions(a, b) {
      const getSortKey = (option) => {
        return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
      };
      return getSortKey(a).localeCompare(getSortKey(b));
    }
    visibleOptions(cmd) {
      const visibleOptions = cmd.options.filter((option) => !option.hidden);
      const helpOption = cmd._getHelpOption();
      if (helpOption && !helpOption.hidden) {
        const removeShort = helpOption.short && cmd._findOption(helpOption.short);
        const removeLong = helpOption.long && cmd._findOption(helpOption.long);
        if (!removeShort && !removeLong) {
          visibleOptions.push(helpOption);
        } else if (helpOption.long && !removeLong) {
          visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
        } else if (helpOption.short && !removeShort) {
          visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
        }
      }
      if (this.sortOptions) {
        visibleOptions.sort(this.compareOptions);
      }
      return visibleOptions;
    }
    visibleGlobalOptions(cmd) {
      if (!this.showGlobalOptions)
        return [];
      const globalOptions = [];
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
        globalOptions.push(...visibleOptions);
      }
      if (this.sortOptions) {
        globalOptions.sort(this.compareOptions);
      }
      return globalOptions;
    }
    visibleArguments(cmd) {
      if (cmd._argsDescription) {
        cmd.registeredArguments.forEach((argument) => {
          argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
        });
      }
      if (cmd.registeredArguments.find((argument) => argument.description)) {
        return cmd.registeredArguments;
      }
      return [];
    }
    subcommandTerm(cmd) {
      const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
      return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + (args ? " " + args : "");
    }
    optionTerm(option) {
      return option.flags;
    }
    argumentTerm(argument) {
      return argument.name();
    }
    longestSubcommandTermLength(cmd, helper) {
      return helper.visibleCommands(cmd).reduce((max, command) => {
        return Math.max(max, helper.subcommandTerm(command).length);
      }, 0);
    }
    longestOptionTermLength(cmd, helper) {
      return helper.visibleOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestGlobalOptionTermLength(cmd, helper) {
      return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestArgumentTermLength(cmd, helper) {
      return helper.visibleArguments(cmd).reduce((max, argument) => {
        return Math.max(max, helper.argumentTerm(argument).length);
      }, 0);
    }
    commandUsage(cmd) {
      let cmdName = cmd._name;
      if (cmd._aliases[0]) {
        cmdName = cmdName + "|" + cmd._aliases[0];
      }
      let ancestorCmdNames = "";
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
      }
      return ancestorCmdNames + cmdName + " " + cmd.usage();
    }
    commandDescription(cmd) {
      return cmd.description();
    }
    subcommandDescription(cmd) {
      return cmd.summary() || cmd.description();
    }
    optionDescription(option) {
      const extraInfo = [];
      if (option.argChoices) {
        extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (option.defaultValue !== undefined) {
        const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
        if (showDefault) {
          extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
        }
      }
      if (option.presetArg !== undefined && option.optional) {
        extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
      }
      if (option.envVar !== undefined) {
        extraInfo.push(`env: ${option.envVar}`);
      }
      if (extraInfo.length > 0) {
        return `${option.description} (${extraInfo.join(", ")})`;
      }
      return option.description;
    }
    argumentDescription(argument) {
      const extraInfo = [];
      if (argument.argChoices) {
        extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (argument.defaultValue !== undefined) {
        extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
      }
      if (extraInfo.length > 0) {
        const extraDescripton = `(${extraInfo.join(", ")})`;
        if (argument.description) {
          return `${argument.description} ${extraDescripton}`;
        }
        return extraDescripton;
      }
      return argument.description;
    }
    formatHelp(cmd, helper) {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth || 80;
      const itemIndentWidth = 2;
      const itemSeparatorWidth = 2;
      function formatItem(term, description) {
        if (description) {
          const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
          return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
        }
        return term;
      }
      function formatList(textArray) {
        return textArray.join(`
`).replace(/^/gm, " ".repeat(itemIndentWidth));
      }
      let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([
          helper.wrap(commandDescription, helpWidth, 0),
          ""
        ]);
      }
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
      });
      if (argumentList.length > 0) {
        output = output.concat(["Arguments:", formatList(argumentList), ""]);
      }
      const optionList = helper.visibleOptions(cmd).map((option) => {
        return formatItem(helper.optionTerm(option), helper.optionDescription(option));
      });
      if (optionList.length > 0) {
        output = output.concat(["Options:", formatList(optionList), ""]);
      }
      if (this.showGlobalOptions) {
        const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
          return formatItem(helper.optionTerm(option), helper.optionDescription(option));
        });
        if (globalOptionList.length > 0) {
          output = output.concat([
            "Global Options:",
            formatList(globalOptionList),
            ""
          ]);
        }
      }
      const commandList = helper.visibleCommands(cmd).map((cmd2) => {
        return formatItem(helper.subcommandTerm(cmd2), helper.subcommandDescription(cmd2));
      });
      if (commandList.length > 0) {
        output = output.concat(["Commands:", formatList(commandList), ""]);
      }
      return output.join(`
`);
    }
    padWidth(cmd, helper) {
      return Math.max(helper.longestOptionTermLength(cmd, helper), helper.longestGlobalOptionTermLength(cmd, helper), helper.longestSubcommandTermLength(cmd, helper), helper.longestArgumentTermLength(cmd, helper));
    }
    wrap(str, width, indent, minColumnWidth = 40) {
      const indents = " \\f\\t\\v   -   　\uFEFF";
      const manualIndent = new RegExp(`[\\n][${indents}]+`);
      if (str.match(manualIndent))
        return str;
      const columnWidth = width - indent;
      if (columnWidth < minColumnWidth)
        return str;
      const leadingStr = str.slice(0, indent);
      const columnText = str.slice(indent).replace(`\r
`, `
`);
      const indentString = " ".repeat(indent);
      const zeroWidthSpace = "​";
      const breaks = `\\s${zeroWidthSpace}`;
      const regex = new RegExp(`
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`, "g");
      const lines = columnText.match(regex) || [];
      return leadingStr + lines.map((line, i) => {
        if (line === `
`)
          return "";
        return (i > 0 ? indentString : "") + line.trimEnd();
      }).join(`
`);
    }
  }
  exports.Help = Help;
});

// node_modules/commander/lib/option.js
var require_option = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Option {
    constructor(flags, description) {
      this.flags = flags;
      this.description = description || "";
      this.required = flags.includes("<");
      this.optional = flags.includes("[");
      this.variadic = /\w\.\.\.[>\]]$/.test(flags);
      this.mandatory = false;
      const optionFlags = splitOptionFlags(flags);
      this.short = optionFlags.shortFlag;
      this.long = optionFlags.longFlag;
      this.negate = false;
      if (this.long) {
        this.negate = this.long.startsWith("--no-");
      }
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.presetArg = undefined;
      this.envVar = undefined;
      this.parseArg = undefined;
      this.hidden = false;
      this.argChoices = undefined;
      this.conflictsWith = [];
      this.implied = undefined;
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    preset(arg) {
      this.presetArg = arg;
      return this;
    }
    conflicts(names) {
      this.conflictsWith = this.conflictsWith.concat(names);
      return this;
    }
    implies(impliedOptionValues) {
      let newImplied = impliedOptionValues;
      if (typeof impliedOptionValues === "string") {
        newImplied = { [impliedOptionValues]: true };
      }
      this.implied = Object.assign(this.implied || {}, newImplied);
      return this;
    }
    env(name) {
      this.envVar = name;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    makeOptionMandatory(mandatory = true) {
      this.mandatory = !!mandatory;
      return this;
    }
    hideHelp(hide = true) {
      this.hidden = !!hide;
      return this;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    name() {
      if (this.long) {
        return this.long.replace(/^--/, "");
      }
      return this.short.replace(/^-/, "");
    }
    attributeName() {
      return camelcase(this.name().replace(/^no-/, ""));
    }
    is(arg) {
      return this.short === arg || this.long === arg;
    }
    isBoolean() {
      return !this.required && !this.optional && !this.negate;
    }
  }

  class DualOptions {
    constructor(options) {
      this.positiveOptions = new Map;
      this.negativeOptions = new Map;
      this.dualOptions = new Set;
      options.forEach((option) => {
        if (option.negate) {
          this.negativeOptions.set(option.attributeName(), option);
        } else {
          this.positiveOptions.set(option.attributeName(), option);
        }
      });
      this.negativeOptions.forEach((value, key) => {
        if (this.positiveOptions.has(key)) {
          this.dualOptions.add(key);
        }
      });
    }
    valueFromOption(value, option) {
      const optionKey = option.attributeName();
      if (!this.dualOptions.has(optionKey))
        return true;
      const preset = this.negativeOptions.get(optionKey).presetArg;
      const negativeValue = preset !== undefined ? preset : false;
      return option.negate === (negativeValue === value);
    }
  }
  function camelcase(str) {
    return str.split("-").reduce((str2, word) => {
      return str2 + word[0].toUpperCase() + word.slice(1);
    });
  }
  function splitOptionFlags(flags) {
    let shortFlag;
    let longFlag;
    const flagParts = flags.split(/[ |,]+/);
    if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
      shortFlag = flagParts.shift();
    longFlag = flagParts.shift();
    if (!shortFlag && /^-[^-]$/.test(longFlag)) {
      shortFlag = longFlag;
      longFlag = undefined;
    }
    return { shortFlag, longFlag };
  }
  exports.Option = Option;
  exports.DualOptions = DualOptions;
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS((exports) => {
  var maxDistance = 3;
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > maxDistance)
      return Math.max(a.length, b.length);
    const d = [];
    for (let i = 0;i <= a.length; i++) {
      d[i] = [i];
    }
    for (let j = 0;j <= b.length; j++) {
      d[0][j] = j;
    }
    for (let j = 1;j <= b.length; j++) {
      for (let i = 1;i <= a.length; i++) {
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
        } else {
          cost = 1;
        }
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }
  function suggestSimilar(word, candidates) {
    if (!candidates || candidates.length === 0)
      return "";
    candidates = Array.from(new Set(candidates));
    const searchingOptions = word.startsWith("--");
    if (searchingOptions) {
      word = word.slice(2);
      candidates = candidates.map((candidate) => candidate.slice(2));
    }
    let similar = [];
    let bestDistance = maxDistance;
    const minSimilarity = 0.4;
    candidates.forEach((candidate) => {
      if (candidate.length <= 1)
        return;
      const distance = editDistance(word, candidate);
      const length = Math.max(word.length, candidate.length);
      const similarity = (length - distance) / length;
      if (similarity > minSimilarity) {
        if (distance < bestDistance) {
          bestDistance = distance;
          similar = [candidate];
        } else if (distance === bestDistance) {
          similar.push(candidate);
        }
      }
    });
    similar.sort((a, b) => a.localeCompare(b));
    if (searchingOptions) {
      similar = similar.map((candidate) => `--${candidate}`);
    }
    if (similar.length > 1) {
      return `
(Did you mean one of ${similar.join(", ")}?)`;
    }
    if (similar.length === 1) {
      return `
(Did you mean ${similar[0]}?)`;
    }
    return "";
  }
  exports.suggestSimilar = suggestSimilar;
});

// node_modules/commander/lib/command.js
var require_command = __commonJS((exports) => {
  var EventEmitter = __require("node:events").EventEmitter;
  var childProcess = __require("node:child_process");
  var path = __require("node:path");
  var fs = __require("node:fs");
  var process2 = __require("node:process");
  var { Argument, humanReadableArgName } = require_argument();
  var { CommanderError } = require_error();
  var { Help } = require_help();
  var { Option, DualOptions } = require_option();
  var { suggestSimilar } = require_suggestSimilar();

  class Command extends EventEmitter {
    constructor(name) {
      super();
      this.commands = [];
      this.options = [];
      this.parent = null;
      this._allowUnknownOption = false;
      this._allowExcessArguments = true;
      this.registeredArguments = [];
      this._args = this.registeredArguments;
      this.args = [];
      this.rawArgs = [];
      this.processedArgs = [];
      this._scriptPath = null;
      this._name = name || "";
      this._optionValues = {};
      this._optionValueSources = {};
      this._storeOptionsAsProperties = false;
      this._actionHandler = null;
      this._executableHandler = false;
      this._executableFile = null;
      this._executableDir = null;
      this._defaultCommandName = null;
      this._exitCallback = null;
      this._aliases = [];
      this._combineFlagAndOptionalValue = true;
      this._description = "";
      this._summary = "";
      this._argsDescription = undefined;
      this._enablePositionalOptions = false;
      this._passThroughOptions = false;
      this._lifeCycleHooks = {};
      this._showHelpAfterError = false;
      this._showSuggestionAfterError = true;
      this._outputConfiguration = {
        writeOut: (str) => process2.stdout.write(str),
        writeErr: (str) => process2.stderr.write(str),
        getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : undefined,
        getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : undefined,
        outputError: (str, write) => write(str)
      };
      this._hidden = false;
      this._helpOption = undefined;
      this._addImplicitHelpCommand = undefined;
      this._helpCommand = undefined;
      this._helpConfiguration = {};
    }
    copyInheritedSettings(sourceCommand) {
      this._outputConfiguration = sourceCommand._outputConfiguration;
      this._helpOption = sourceCommand._helpOption;
      this._helpCommand = sourceCommand._helpCommand;
      this._helpConfiguration = sourceCommand._helpConfiguration;
      this._exitCallback = sourceCommand._exitCallback;
      this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
      this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
      this._allowExcessArguments = sourceCommand._allowExcessArguments;
      this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
      this._showHelpAfterError = sourceCommand._showHelpAfterError;
      this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
      return this;
    }
    _getCommandAndAncestors() {
      const result = [];
      for (let command = this;command; command = command.parent) {
        result.push(command);
      }
      return result;
    }
    command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
      let desc = actionOptsOrExecDesc;
      let opts = execOpts;
      if (typeof desc === "object" && desc !== null) {
        opts = desc;
        desc = null;
      }
      opts = opts || {};
      const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
      const cmd = this.createCommand(name);
      if (desc) {
        cmd.description(desc);
        cmd._executableHandler = true;
      }
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      cmd._hidden = !!(opts.noHelp || opts.hidden);
      cmd._executableFile = opts.executableFile || null;
      if (args)
        cmd.arguments(args);
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd.copyInheritedSettings(this);
      if (desc)
        return this;
      return cmd;
    }
    createCommand(name) {
      return new Command(name);
    }
    createHelp() {
      return Object.assign(new Help, this.configureHelp());
    }
    configureHelp(configuration) {
      if (configuration === undefined)
        return this._helpConfiguration;
      this._helpConfiguration = configuration;
      return this;
    }
    configureOutput(configuration) {
      if (configuration === undefined)
        return this._outputConfiguration;
      Object.assign(this._outputConfiguration, configuration);
      return this;
    }
    showHelpAfterError(displayHelp = true) {
      if (typeof displayHelp !== "string")
        displayHelp = !!displayHelp;
      this._showHelpAfterError = displayHelp;
      return this;
    }
    showSuggestionAfterError(displaySuggestion = true) {
      this._showSuggestionAfterError = !!displaySuggestion;
      return this;
    }
    addCommand(cmd, opts) {
      if (!cmd._name) {
        throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
      }
      opts = opts || {};
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      if (opts.noHelp || opts.hidden)
        cmd._hidden = true;
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd._checkForBrokenPassThrough();
      return this;
    }
    createArgument(name, description) {
      return new Argument(name, description);
    }
    argument(name, description, fn, defaultValue) {
      const argument = this.createArgument(name, description);
      if (typeof fn === "function") {
        argument.default(defaultValue).argParser(fn);
      } else {
        argument.default(fn);
      }
      this.addArgument(argument);
      return this;
    }
    arguments(names) {
      names.trim().split(/ +/).forEach((detail) => {
        this.argument(detail);
      });
      return this;
    }
    addArgument(argument) {
      const previousArgument = this.registeredArguments.slice(-1)[0];
      if (previousArgument && previousArgument.variadic) {
        throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
      }
      if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
        throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
      }
      this.registeredArguments.push(argument);
      return this;
    }
    helpCommand(enableOrNameAndArgs, description) {
      if (typeof enableOrNameAndArgs === "boolean") {
        this._addImplicitHelpCommand = enableOrNameAndArgs;
        return this;
      }
      enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
      const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
      const helpDescription = description ?? "display help for command";
      const helpCommand = this.createCommand(helpName);
      helpCommand.helpOption(false);
      if (helpArgs)
        helpCommand.arguments(helpArgs);
      if (helpDescription)
        helpCommand.description(helpDescription);
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    addHelpCommand(helpCommand, deprecatedDescription) {
      if (typeof helpCommand !== "object") {
        this.helpCommand(helpCommand, deprecatedDescription);
        return this;
      }
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    _getHelpCommand() {
      const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
      if (hasImplicitHelpCommand) {
        if (this._helpCommand === undefined) {
          this.helpCommand(undefined, undefined);
        }
        return this._helpCommand;
      }
      return null;
    }
    hook(event, listener) {
      const allowedValues = ["preSubcommand", "preAction", "postAction"];
      if (!allowedValues.includes(event)) {
        throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      if (this._lifeCycleHooks[event]) {
        this._lifeCycleHooks[event].push(listener);
      } else {
        this._lifeCycleHooks[event] = [listener];
      }
      return this;
    }
    exitOverride(fn) {
      if (fn) {
        this._exitCallback = fn;
      } else {
        this._exitCallback = (err) => {
          if (err.code !== "commander.executeSubCommandAsync") {
            throw err;
          } else {}
        };
      }
      return this;
    }
    _exit(exitCode, code, message) {
      if (this._exitCallback) {
        this._exitCallback(new CommanderError(exitCode, code, message));
      }
      process2.exit(exitCode);
    }
    action(fn) {
      const listener = (args) => {
        const expectedArgsCount = this.registeredArguments.length;
        const actionArgs = args.slice(0, expectedArgsCount);
        if (this._storeOptionsAsProperties) {
          actionArgs[expectedArgsCount] = this;
        } else {
          actionArgs[expectedArgsCount] = this.opts();
        }
        actionArgs.push(this);
        return fn.apply(this, actionArgs);
      };
      this._actionHandler = listener;
      return this;
    }
    createOption(flags, description) {
      return new Option(flags, description);
    }
    _callParseArg(target, value, previous, invalidArgumentMessage) {
      try {
        return target.parseArg(value, previous);
      } catch (err) {
        if (err.code === "commander.invalidArgument") {
          const message = `${invalidArgumentMessage} ${err.message}`;
          this.error(message, { exitCode: err.exitCode, code: err.code });
        }
        throw err;
      }
    }
    _registerOption(option) {
      const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
      if (matchingOption) {
        const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
        throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
      }
      this.options.push(option);
    }
    _registerCommand(command) {
      const knownBy = (cmd) => {
        return [cmd.name()].concat(cmd.aliases());
      };
      const alreadyUsed = knownBy(command).find((name) => this._findCommand(name));
      if (alreadyUsed) {
        const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
        const newCmd = knownBy(command).join("|");
        throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
      }
      this.commands.push(command);
    }
    addOption(option) {
      this._registerOption(option);
      const oname = option.name();
      const name = option.attributeName();
      if (option.negate) {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(name, option.defaultValue === undefined ? true : option.defaultValue, "default");
        }
      } else if (option.defaultValue !== undefined) {
        this.setOptionValueWithSource(name, option.defaultValue, "default");
      }
      const handleOptionValue = (val, invalidValueMessage, valueSource) => {
        if (val == null && option.presetArg !== undefined) {
          val = option.presetArg;
        }
        const oldValue = this.getOptionValue(name);
        if (val !== null && option.parseArg) {
          val = this._callParseArg(option, val, oldValue, invalidValueMessage);
        } else if (val !== null && option.variadic) {
          val = option._concatValue(val, oldValue);
        }
        if (val == null) {
          if (option.negate) {
            val = false;
          } else if (option.isBoolean() || option.optional) {
            val = true;
          } else {
            val = "";
          }
        }
        this.setOptionValueWithSource(name, val, valueSource);
      };
      this.on("option:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "cli");
      });
      if (option.envVar) {
        this.on("optionEnv:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "env");
        });
      }
      return this;
    }
    _optionEx(config, flags, description, fn, defaultValue) {
      if (typeof flags === "object" && flags instanceof Option) {
        throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
      }
      const option = this.createOption(flags, description);
      option.makeOptionMandatory(!!config.mandatory);
      if (typeof fn === "function") {
        option.default(defaultValue).argParser(fn);
      } else if (fn instanceof RegExp) {
        const regex = fn;
        fn = (val, def) => {
          const m = regex.exec(val);
          return m ? m[0] : def;
        };
        option.default(defaultValue).argParser(fn);
      } else {
        option.default(fn);
      }
      return this.addOption(option);
    }
    option(flags, description, parseArg, defaultValue) {
      return this._optionEx({}, flags, description, parseArg, defaultValue);
    }
    requiredOption(flags, description, parseArg, defaultValue) {
      return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
    }
    combineFlagAndOptionalValue(combine = true) {
      this._combineFlagAndOptionalValue = !!combine;
      return this;
    }
    allowUnknownOption(allowUnknown = true) {
      this._allowUnknownOption = !!allowUnknown;
      return this;
    }
    allowExcessArguments(allowExcess = true) {
      this._allowExcessArguments = !!allowExcess;
      return this;
    }
    enablePositionalOptions(positional = true) {
      this._enablePositionalOptions = !!positional;
      return this;
    }
    passThroughOptions(passThrough = true) {
      this._passThroughOptions = !!passThrough;
      this._checkForBrokenPassThrough();
      return this;
    }
    _checkForBrokenPassThrough() {
      if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
        throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
      }
    }
    storeOptionsAsProperties(storeAsProperties = true) {
      if (this.options.length) {
        throw new Error("call .storeOptionsAsProperties() before adding options");
      }
      if (Object.keys(this._optionValues).length) {
        throw new Error("call .storeOptionsAsProperties() before setting option values");
      }
      this._storeOptionsAsProperties = !!storeAsProperties;
      return this;
    }
    getOptionValue(key) {
      if (this._storeOptionsAsProperties) {
        return this[key];
      }
      return this._optionValues[key];
    }
    setOptionValue(key, value) {
      return this.setOptionValueWithSource(key, value, undefined);
    }
    setOptionValueWithSource(key, value, source) {
      if (this._storeOptionsAsProperties) {
        this[key] = value;
      } else {
        this._optionValues[key] = value;
      }
      this._optionValueSources[key] = source;
      return this;
    }
    getOptionValueSource(key) {
      return this._optionValueSources[key];
    }
    getOptionValueSourceWithGlobals(key) {
      let source;
      this._getCommandAndAncestors().forEach((cmd) => {
        if (cmd.getOptionValueSource(key) !== undefined) {
          source = cmd.getOptionValueSource(key);
        }
      });
      return source;
    }
    _prepareUserArgs(argv, parseOptions) {
      if (argv !== undefined && !Array.isArray(argv)) {
        throw new Error("first parameter to parse must be array or undefined");
      }
      parseOptions = parseOptions || {};
      if (argv === undefined && parseOptions.from === undefined) {
        if (process2.versions?.electron) {
          parseOptions.from = "electron";
        }
        const execArgv = process2.execArgv ?? [];
        if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
          parseOptions.from = "eval";
        }
      }
      if (argv === undefined) {
        argv = process2.argv;
      }
      this.rawArgs = argv.slice();
      let userArgs;
      switch (parseOptions.from) {
        case undefined:
        case "node":
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
          break;
        case "electron":
          if (process2.defaultApp) {
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
          } else {
            userArgs = argv.slice(1);
          }
          break;
        case "user":
          userArgs = argv.slice(0);
          break;
        case "eval":
          userArgs = argv.slice(1);
          break;
        default:
          throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
      }
      if (!this._name && this._scriptPath)
        this.nameFromFilename(this._scriptPath);
      this._name = this._name || "program";
      return userArgs;
    }
    parse(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      this._parseCommand([], userArgs);
      return this;
    }
    async parseAsync(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      await this._parseCommand([], userArgs);
      return this;
    }
    _executeSubCommand(subcommand, args) {
      args = args.slice();
      let launchWithNode = false;
      const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
      function findFile(baseDir, baseName) {
        const localBin = path.resolve(baseDir, baseName);
        if (fs.existsSync(localBin))
          return localBin;
        if (sourceExt.includes(path.extname(baseName)))
          return;
        const foundExt = sourceExt.find((ext) => fs.existsSync(`${localBin}${ext}`));
        if (foundExt)
          return `${localBin}${foundExt}`;
        return;
      }
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
      let executableDir = this._executableDir || "";
      if (this._scriptPath) {
        let resolvedScriptPath;
        try {
          resolvedScriptPath = fs.realpathSync(this._scriptPath);
        } catch (err) {
          resolvedScriptPath = this._scriptPath;
        }
        executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
      }
      if (executableDir) {
        let localFile = findFile(executableDir, executableFile);
        if (!localFile && !subcommand._executableFile && this._scriptPath) {
          const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
          if (legacyName !== this._name) {
            localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
          }
        }
        executableFile = localFile || executableFile;
      }
      launchWithNode = sourceExt.includes(path.extname(executableFile));
      let proc;
      if (process2.platform !== "win32") {
        if (launchWithNode) {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
        } else {
          proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
        }
      } else {
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
      }
      if (!proc.killed) {
        const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
        signals.forEach((signal) => {
          process2.on(signal, () => {
            if (proc.killed === false && proc.exitCode === null) {
              proc.kill(signal);
            }
          });
        });
      }
      const exitCallback = this._exitCallback;
      proc.on("close", (code) => {
        code = code ?? 1;
        if (!exitCallback) {
          process2.exit(code);
        } else {
          exitCallback(new CommanderError(code, "commander.executeSubCommandAsync", "(close)"));
        }
      });
      proc.on("error", (err) => {
        if (err.code === "ENOENT") {
          const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
          const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
          throw new Error(executableMissing);
        } else if (err.code === "EACCES") {
          throw new Error(`'${executableFile}' not executable`);
        }
        if (!exitCallback) {
          process2.exit(1);
        } else {
          const wrappedError = new CommanderError(1, "commander.executeSubCommandAsync", "(error)");
          wrappedError.nestedError = err;
          exitCallback(wrappedError);
        }
      });
      this.runningCommand = proc;
    }
    _dispatchSubcommand(commandName, operands, unknown) {
      const subCommand = this._findCommand(commandName);
      if (!subCommand)
        this.help({ error: true });
      let promiseChain;
      promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
      promiseChain = this._chainOrCall(promiseChain, () => {
        if (subCommand._executableHandler) {
          this._executeSubCommand(subCommand, operands.concat(unknown));
        } else {
          return subCommand._parseCommand(operands, unknown);
        }
      });
      return promiseChain;
    }
    _dispatchHelpCommand(subcommandName) {
      if (!subcommandName) {
        this.help();
      }
      const subCommand = this._findCommand(subcommandName);
      if (subCommand && !subCommand._executableHandler) {
        subCommand.help();
      }
      return this._dispatchSubcommand(subcommandName, [], [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]);
    }
    _checkNumberOfArguments() {
      this.registeredArguments.forEach((arg, i) => {
        if (arg.required && this.args[i] == null) {
          this.missingArgument(arg.name());
        }
      });
      if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
        return;
      }
      if (this.args.length > this.registeredArguments.length) {
        this._excessArguments(this.args);
      }
    }
    _processArguments() {
      const myParseArg = (argument, value, previous) => {
        let parsedValue = value;
        if (value !== null && argument.parseArg) {
          const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
          parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
        }
        return parsedValue;
      };
      this._checkNumberOfArguments();
      const processedArgs = [];
      this.registeredArguments.forEach((declaredArg, index) => {
        let value = declaredArg.defaultValue;
        if (declaredArg.variadic) {
          if (index < this.args.length) {
            value = this.args.slice(index);
            if (declaredArg.parseArg) {
              value = value.reduce((processed, v) => {
                return myParseArg(declaredArg, v, processed);
              }, declaredArg.defaultValue);
            }
          } else if (value === undefined) {
            value = [];
          }
        } else if (index < this.args.length) {
          value = this.args[index];
          if (declaredArg.parseArg) {
            value = myParseArg(declaredArg, value, declaredArg.defaultValue);
          }
        }
        processedArgs[index] = value;
      });
      this.processedArgs = processedArgs;
    }
    _chainOrCall(promise, fn) {
      if (promise && promise.then && typeof promise.then === "function") {
        return promise.then(() => fn());
      }
      return fn();
    }
    _chainOrCallHooks(promise, event) {
      let result = promise;
      const hooks = [];
      this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== undefined).forEach((hookedCommand) => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback });
        });
      });
      if (event === "postAction") {
        hooks.reverse();
      }
      hooks.forEach((hookDetail) => {
        result = this._chainOrCall(result, () => {
          return hookDetail.callback(hookDetail.hookedCommand, this);
        });
      });
      return result;
    }
    _chainOrCallSubCommandHook(promise, subCommand, event) {
      let result = promise;
      if (this._lifeCycleHooks[event] !== undefined) {
        this._lifeCycleHooks[event].forEach((hook) => {
          result = this._chainOrCall(result, () => {
            return hook(this, subCommand);
          });
        });
      }
      return result;
    }
    _parseCommand(operands, unknown) {
      const parsed = this.parseOptions(unknown);
      this._parseOptionsEnv();
      this._parseOptionsImplied();
      operands = operands.concat(parsed.operands);
      unknown = parsed.unknown;
      this.args = operands.concat(unknown);
      if (operands && this._findCommand(operands[0])) {
        return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
      }
      if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
        return this._dispatchHelpCommand(operands[1]);
      }
      if (this._defaultCommandName) {
        this._outputHelpIfRequested(unknown);
        return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
      }
      if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
        this.help({ error: true });
      }
      this._outputHelpIfRequested(parsed.unknown);
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      const checkForUnknownOptions = () => {
        if (parsed.unknown.length > 0) {
          this.unknownOption(parsed.unknown[0]);
        }
      };
      const commandEvent = `command:${this.name()}`;
      if (this._actionHandler) {
        checkForUnknownOptions();
        this._processArguments();
        let promiseChain;
        promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
        promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
        if (this.parent) {
          promiseChain = this._chainOrCall(promiseChain, () => {
            this.parent.emit(commandEvent, operands, unknown);
          });
        }
        promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
        return promiseChain;
      }
      if (this.parent && this.parent.listenerCount(commandEvent)) {
        checkForUnknownOptions();
        this._processArguments();
        this.parent.emit(commandEvent, operands, unknown);
      } else if (operands.length) {
        if (this._findCommand("*")) {
          return this._dispatchSubcommand("*", operands, unknown);
        }
        if (this.listenerCount("command:*")) {
          this.emit("command:*", operands, unknown);
        } else if (this.commands.length) {
          this.unknownCommand();
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      } else if (this.commands.length) {
        checkForUnknownOptions();
        this.help({ error: true });
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    }
    _findCommand(name) {
      if (!name)
        return;
      return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
    }
    _findOption(arg) {
      return this.options.find((option) => option.is(arg));
    }
    _checkForMissingMandatoryOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd.options.forEach((anOption) => {
          if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
            cmd.missingMandatoryOptionValue(anOption);
          }
        });
      });
    }
    _checkForConflictingLocalOptions() {
      const definedNonDefaultOptions = this.options.filter((option) => {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === undefined) {
          return false;
        }
        return this.getOptionValueSource(optionKey) !== "default";
      });
      const optionsWithConflicting = definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0);
      optionsWithConflicting.forEach((option) => {
        const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
        if (conflictingAndDefined) {
          this._conflictingOption(option, conflictingAndDefined);
        }
      });
    }
    _checkForConflictingOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd._checkForConflictingLocalOptions();
      });
    }
    parseOptions(argv) {
      const operands = [];
      const unknown = [];
      let dest = operands;
      const args = argv.slice();
      function maybeOption(arg) {
        return arg.length > 1 && arg[0] === "-";
      }
      let activeVariadicOption = null;
      while (args.length) {
        const arg = args.shift();
        if (arg === "--") {
          if (dest === unknown)
            dest.push(arg);
          dest.push(...args);
          break;
        }
        if (activeVariadicOption && !maybeOption(arg)) {
          this.emit(`option:${activeVariadicOption.name()}`, arg);
          continue;
        }
        activeVariadicOption = null;
        if (maybeOption(arg)) {
          const option = this._findOption(arg);
          if (option) {
            if (option.required) {
              const value = args.shift();
              if (value === undefined)
                this.optionMissingArgument(option);
              this.emit(`option:${option.name()}`, value);
            } else if (option.optional) {
              let value = null;
              if (args.length > 0 && !maybeOption(args[0])) {
                value = args.shift();
              }
              this.emit(`option:${option.name()}`, value);
            } else {
              this.emit(`option:${option.name()}`);
            }
            activeVariadicOption = option.variadic ? option : null;
            continue;
          }
        }
        if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
          const option = this._findOption(`-${arg[1]}`);
          if (option) {
            if (option.required || option.optional && this._combineFlagAndOptionalValue) {
              this.emit(`option:${option.name()}`, arg.slice(2));
            } else {
              this.emit(`option:${option.name()}`);
              args.unshift(`-${arg.slice(2)}`);
            }
            continue;
          }
        }
        if (/^--[^=]+=/.test(arg)) {
          const index = arg.indexOf("=");
          const option = this._findOption(arg.slice(0, index));
          if (option && (option.required || option.optional)) {
            this.emit(`option:${option.name()}`, arg.slice(index + 1));
            continue;
          }
        }
        if (maybeOption(arg)) {
          dest = unknown;
        }
        if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
          if (this._findCommand(arg)) {
            operands.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
            operands.push(arg);
            if (args.length > 0)
              operands.push(...args);
            break;
          } else if (this._defaultCommandName) {
            unknown.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          }
        }
        if (this._passThroughOptions) {
          dest.push(arg);
          if (args.length > 0)
            dest.push(...args);
          break;
        }
        dest.push(arg);
      }
      return { operands, unknown };
    }
    opts() {
      if (this._storeOptionsAsProperties) {
        const result = {};
        const len = this.options.length;
        for (let i = 0;i < len; i++) {
          const key = this.options[i].attributeName();
          result[key] = key === this._versionOptionName ? this._version : this[key];
        }
        return result;
      }
      return this._optionValues;
    }
    optsWithGlobals() {
      return this._getCommandAndAncestors().reduce((combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()), {});
    }
    error(message, errorOptions) {
      this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
      if (typeof this._showHelpAfterError === "string") {
        this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
      } else if (this._showHelpAfterError) {
        this._outputConfiguration.writeErr(`
`);
        this.outputHelp({ error: true });
      }
      const config = errorOptions || {};
      const exitCode = config.exitCode || 1;
      const code = config.code || "commander.error";
      this._exit(exitCode, code, message);
    }
    _parseOptionsEnv() {
      this.options.forEach((option) => {
        if (option.envVar && option.envVar in process2.env) {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === undefined || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
            if (option.required || option.optional) {
              this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
            } else {
              this.emit(`optionEnv:${option.name()}`);
            }
          }
        }
      });
    }
    _parseOptionsImplied() {
      const dualHelper = new DualOptions(this.options);
      const hasCustomOptionValue = (optionKey) => {
        return this.getOptionValue(optionKey) !== undefined && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
      };
      this.options.filter((option) => option.implied !== undefined && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
        Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
          this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
        });
      });
    }
    missingArgument(name) {
      const message = `error: missing required argument '${name}'`;
      this.error(message, { code: "commander.missingArgument" });
    }
    optionMissingArgument(option) {
      const message = `error: option '${option.flags}' argument missing`;
      this.error(message, { code: "commander.optionMissingArgument" });
    }
    missingMandatoryOptionValue(option) {
      const message = `error: required option '${option.flags}' not specified`;
      this.error(message, { code: "commander.missingMandatoryOptionValue" });
    }
    _conflictingOption(option, conflictingOption) {
      const findBestOptionFromValue = (option2) => {
        const optionKey = option2.attributeName();
        const optionValue = this.getOptionValue(optionKey);
        const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
        const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
        if (negativeOption && (negativeOption.presetArg === undefined && optionValue === false || negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg)) {
          return negativeOption;
        }
        return positiveOption || option2;
      };
      const getErrorMessage = (option2) => {
        const bestOption = findBestOptionFromValue(option2);
        const optionKey = bestOption.attributeName();
        const source = this.getOptionValueSource(optionKey);
        if (source === "env") {
          return `environment variable '${bestOption.envVar}'`;
        }
        return `option '${bestOption.flags}'`;
      };
      const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
      this.error(message, { code: "commander.conflictingOption" });
    }
    unknownOption(flag) {
      if (this._allowUnknownOption)
        return;
      let suggestion = "";
      if (flag.startsWith("--") && this._showSuggestionAfterError) {
        let candidateFlags = [];
        let command = this;
        do {
          const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
          candidateFlags = candidateFlags.concat(moreFlags);
          command = command.parent;
        } while (command && !command._enablePositionalOptions);
        suggestion = suggestSimilar(flag, candidateFlags);
      }
      const message = `error: unknown option '${flag}'${suggestion}`;
      this.error(message, { code: "commander.unknownOption" });
    }
    _excessArguments(receivedArgs) {
      if (this._allowExcessArguments)
        return;
      const expected = this.registeredArguments.length;
      const s = expected === 1 ? "" : "s";
      const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
      const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
      this.error(message, { code: "commander.excessArguments" });
    }
    unknownCommand() {
      const unknownName = this.args[0];
      let suggestion = "";
      if (this._showSuggestionAfterError) {
        const candidateNames = [];
        this.createHelp().visibleCommands(this).forEach((command) => {
          candidateNames.push(command.name());
          if (command.alias())
            candidateNames.push(command.alias());
        });
        suggestion = suggestSimilar(unknownName, candidateNames);
      }
      const message = `error: unknown command '${unknownName}'${suggestion}`;
      this.error(message, { code: "commander.unknownCommand" });
    }
    version(str, flags, description) {
      if (str === undefined)
        return this._version;
      this._version = str;
      flags = flags || "-V, --version";
      description = description || "output the version number";
      const versionOption = this.createOption(flags, description);
      this._versionOptionName = versionOption.attributeName();
      this._registerOption(versionOption);
      this.on("option:" + versionOption.name(), () => {
        this._outputConfiguration.writeOut(`${str}
`);
        this._exit(0, "commander.version", str);
      });
      return this;
    }
    description(str, argsDescription) {
      if (str === undefined && argsDescription === undefined)
        return this._description;
      this._description = str;
      if (argsDescription) {
        this._argsDescription = argsDescription;
      }
      return this;
    }
    summary(str) {
      if (str === undefined)
        return this._summary;
      this._summary = str;
      return this;
    }
    alias(alias) {
      if (alias === undefined)
        return this._aliases[0];
      let command = this;
      if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
        command = this.commands[this.commands.length - 1];
      }
      if (alias === command._name)
        throw new Error("Command alias can't be the same as its name");
      const matchingCommand = this.parent?._findCommand(alias);
      if (matchingCommand) {
        const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
        throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
      }
      command._aliases.push(alias);
      return this;
    }
    aliases(aliases) {
      if (aliases === undefined)
        return this._aliases;
      aliases.forEach((alias) => this.alias(alias));
      return this;
    }
    usage(str) {
      if (str === undefined) {
        if (this._usage)
          return this._usage;
        const args = this.registeredArguments.map((arg) => {
          return humanReadableArgName(arg);
        });
        return [].concat(this.options.length || this._helpOption !== null ? "[options]" : [], this.commands.length ? "[command]" : [], this.registeredArguments.length ? args : []).join(" ");
      }
      this._usage = str;
      return this;
    }
    name(str) {
      if (str === undefined)
        return this._name;
      this._name = str;
      return this;
    }
    nameFromFilename(filename) {
      this._name = path.basename(filename, path.extname(filename));
      return this;
    }
    executableDir(path2) {
      if (path2 === undefined)
        return this._executableDir;
      this._executableDir = path2;
      return this;
    }
    helpInformation(contextOptions) {
      const helper = this.createHelp();
      if (helper.helpWidth === undefined) {
        helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
      }
      return helper.formatHelp(this, helper);
    }
    _getHelpContext(contextOptions) {
      contextOptions = contextOptions || {};
      const context = { error: !!contextOptions.error };
      let write;
      if (context.error) {
        write = (arg) => this._outputConfiguration.writeErr(arg);
      } else {
        write = (arg) => this._outputConfiguration.writeOut(arg);
      }
      context.write = contextOptions.write || write;
      context.command = this;
      return context;
    }
    outputHelp(contextOptions) {
      let deprecatedCallback;
      if (typeof contextOptions === "function") {
        deprecatedCallback = contextOptions;
        contextOptions = undefined;
      }
      const context = this._getHelpContext(contextOptions);
      this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
      this.emit("beforeHelp", context);
      let helpInformation = this.helpInformation(context);
      if (deprecatedCallback) {
        helpInformation = deprecatedCallback(helpInformation);
        if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
          throw new Error("outputHelp callback must return a string or a Buffer");
        }
      }
      context.write(helpInformation);
      if (this._getHelpOption()?.long) {
        this.emit(this._getHelpOption().long);
      }
      this.emit("afterHelp", context);
      this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", context));
    }
    helpOption(flags, description) {
      if (typeof flags === "boolean") {
        if (flags) {
          this._helpOption = this._helpOption ?? undefined;
        } else {
          this._helpOption = null;
        }
        return this;
      }
      flags = flags ?? "-h, --help";
      description = description ?? "display help for command";
      this._helpOption = this.createOption(flags, description);
      return this;
    }
    _getHelpOption() {
      if (this._helpOption === undefined) {
        this.helpOption(undefined, undefined);
      }
      return this._helpOption;
    }
    addHelpOption(option) {
      this._helpOption = option;
      return this;
    }
    help(contextOptions) {
      this.outputHelp(contextOptions);
      let exitCode = process2.exitCode || 0;
      if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
        exitCode = 1;
      }
      this._exit(exitCode, "commander.help", "(outputHelp)");
    }
    addHelpText(position, text) {
      const allowedValues = ["beforeAll", "before", "after", "afterAll"];
      if (!allowedValues.includes(position)) {
        throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      const helpEvent = `${position}Help`;
      this.on(helpEvent, (context) => {
        let helpStr;
        if (typeof text === "function") {
          helpStr = text({ error: context.error, command: context.command });
        } else {
          helpStr = text;
        }
        if (helpStr) {
          context.write(`${helpStr}
`);
        }
      });
      return this;
    }
    _outputHelpIfRequested(args) {
      const helpOption = this._getHelpOption();
      const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
      if (helpRequested) {
        this.outputHelp();
        this._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
  }
  function incrementNodeInspectorPort(args) {
    return args.map((arg) => {
      if (!arg.startsWith("--inspect")) {
        return arg;
      }
      let debugOption;
      let debugHost = "127.0.0.1";
      let debugPort = "9229";
      let match;
      if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
        debugOption = match[1];
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
        debugOption = match[1];
        if (/^\d+$/.test(match[3])) {
          debugPort = match[3];
        } else {
          debugHost = match[3];
        }
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
        debugOption = match[1];
        debugHost = match[3];
        debugPort = match[4];
      }
      if (debugOption && debugPort !== "0") {
        return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
      }
      return arg;
    });
  }
  exports.Command = Command;
});

// node_modules/commander/index.js
var require_commander = __commonJS((exports) => {
  var { Argument } = require_argument();
  var { Command } = require_command();
  var { CommanderError, InvalidArgumentError } = require_error();
  var { Help } = require_help();
  var { Option } = require_option();
  exports.program = new Command;
  exports.createCommand = (name) => new Command(name);
  exports.createOption = (flags, description) => new Option(flags, description);
  exports.createArgument = (name, description) => new Argument(name, description);
  exports.Command = Command;
  exports.Option = Option;
  exports.Argument = Argument;
  exports.Help = Help;
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
  exports.InvalidOptionArgumentError = InvalidArgumentError;
});

// node_modules/node-gyp-build/node-gyp-build.js
var require_node_gyp_build = __commonJS((exports, module) => {
  var fs = __require("fs");
  var path = __require("path");
  var os = __require("os");
  var runtimeRequire = typeof __webpack_require__ === "function" ? __non_webpack_require__ : __require;
  var vars = process.config && process.config.variables || {};
  var prebuildsOnly = !!process.env.PREBUILDS_ONLY;
  var abi = process.versions.modules;
  var runtime = isElectron() ? "electron" : isNwjs() ? "node-webkit" : "node";
  var arch = process.env.npm_config_arch || os.arch();
  var platform2 = process.env.npm_config_platform || os.platform();
  var libc = process.env.LIBC || (isAlpine(platform2) ? "musl" : "glibc");
  var armv = process.env.ARM_VERSION || (arch === "arm64" ? "8" : vars.arm_version) || "";
  var uv = (process.versions.uv || "").split(".")[0];
  module.exports = load;
  function load(dir) {
    return runtimeRequire(load.resolve(dir));
  }
  load.resolve = load.path = function(dir) {
    dir = path.resolve(dir || ".");
    try {
      var name = runtimeRequire(path.join(dir, "package.json")).name.toUpperCase().replace(/-/g, "_");
      if (process.env[name + "_PREBUILD"])
        dir = process.env[name + "_PREBUILD"];
    } catch (err) {}
    if (!prebuildsOnly) {
      var release = getFirst(path.join(dir, "build/Release"), matchBuild);
      if (release)
        return release;
      var debug = getFirst(path.join(dir, "build/Debug"), matchBuild);
      if (debug)
        return debug;
    }
    var prebuild = resolve2(dir);
    if (prebuild)
      return prebuild;
    var nearby = resolve2(path.dirname(process.execPath));
    if (nearby)
      return nearby;
    var target = [
      "platform=" + platform2,
      "arch=" + arch,
      "runtime=" + runtime,
      "abi=" + abi,
      "uv=" + uv,
      armv ? "armv=" + armv : "",
      "libc=" + libc,
      "node=" + process.versions.node,
      process.versions.electron ? "electron=" + process.versions.electron : "",
      typeof __webpack_require__ === "function" ? "webpack=true" : ""
    ].filter(Boolean).join(" ");
    throw new Error("No native build was found for " + target + `
    loaded from: ` + dir + `
`);
    function resolve2(dir2) {
      var tuples = readdirSync3(path.join(dir2, "prebuilds")).map(parseTuple);
      var tuple = tuples.filter(matchTuple(platform2, arch)).sort(compareTuples)[0];
      if (!tuple)
        return;
      var prebuilds = path.join(dir2, "prebuilds", tuple.name);
      var parsed = readdirSync3(prebuilds).map(parseTags);
      var candidates = parsed.filter(matchTags(runtime, abi));
      var winner = candidates.sort(compareTags(runtime))[0];
      if (winner)
        return path.join(prebuilds, winner.file);
    }
  };
  function readdirSync3(dir) {
    try {
      return fs.readdirSync(dir);
    } catch (err) {
      return [];
    }
  }
  function getFirst(dir, filter) {
    var files = readdirSync3(dir).filter(filter);
    return files[0] && path.join(dir, files[0]);
  }
  function matchBuild(name) {
    return /\.node$/.test(name);
  }
  function parseTuple(name) {
    var arr = name.split("-");
    if (arr.length !== 2)
      return;
    var platform3 = arr[0];
    var architectures = arr[1].split("+");
    if (!platform3)
      return;
    if (!architectures.length)
      return;
    if (!architectures.every(Boolean))
      return;
    return { name, platform: platform3, architectures };
  }
  function matchTuple(platform3, arch2) {
    return function(tuple) {
      if (tuple == null)
        return false;
      if (tuple.platform !== platform3)
        return false;
      return tuple.architectures.includes(arch2);
    };
  }
  function compareTuples(a, b) {
    return a.architectures.length - b.architectures.length;
  }
  function parseTags(file) {
    var arr = file.split(".");
    var extension = arr.pop();
    var tags = { file, specificity: 0 };
    if (extension !== "node")
      return;
    for (var i = 0;i < arr.length; i++) {
      var tag = arr[i];
      if (tag === "node" || tag === "electron" || tag === "node-webkit") {
        tags.runtime = tag;
      } else if (tag === "napi") {
        tags.napi = true;
      } else if (tag.slice(0, 3) === "abi") {
        tags.abi = tag.slice(3);
      } else if (tag.slice(0, 2) === "uv") {
        tags.uv = tag.slice(2);
      } else if (tag.slice(0, 4) === "armv") {
        tags.armv = tag.slice(4);
      } else if (tag === "glibc" || tag === "musl") {
        tags.libc = tag;
      } else {
        continue;
      }
      tags.specificity++;
    }
    return tags;
  }
  function matchTags(runtime2, abi2) {
    return function(tags) {
      if (tags == null)
        return false;
      if (tags.runtime && tags.runtime !== runtime2 && !runtimeAgnostic(tags))
        return false;
      if (tags.abi && tags.abi !== abi2 && !tags.napi)
        return false;
      if (tags.uv && tags.uv !== uv)
        return false;
      if (tags.armv && tags.armv !== armv)
        return false;
      if (tags.libc && tags.libc !== libc)
        return false;
      return true;
    };
  }
  function runtimeAgnostic(tags) {
    return tags.runtime === "node" && tags.napi;
  }
  function compareTags(runtime2) {
    return function(a, b) {
      if (a.runtime !== b.runtime) {
        return a.runtime === runtime2 ? -1 : 1;
      } else if (a.abi !== b.abi) {
        return a.abi ? -1 : 1;
      } else if (a.specificity !== b.specificity) {
        return a.specificity > b.specificity ? -1 : 1;
      } else {
        return 0;
      }
    };
  }
  function isNwjs() {
    return !!(process.versions && process.versions.nw);
  }
  function isElectron() {
    if (process.versions && process.versions.electron)
      return true;
    if (process.env.ELECTRON_RUN_AS_NODE)
      return true;
    return typeof window !== "undefined" && window.process && window.process.type === "renderer";
  }
  function isAlpine(platform3) {
    return platform3 === "linux" && fs.existsSync("/etc/alpine-release");
  }
  load.parseTags = parseTags;
  load.matchTags = matchTags;
  load.compareTags = compareTags;
  load.parseTuple = parseTuple;
  load.matchTuple = matchTuple;
  load.compareTuples = compareTuples;
});

// node_modules/node-gyp-build/index.js
var require_node_gyp_build2 = __commonJS((exports, module) => {
  var runtimeRequire = typeof __webpack_require__ === "function" ? __non_webpack_require__ : __require;
  if (typeof runtimeRequire.addon === "function") {
    module.exports = runtimeRequire.addon.bind(runtimeRequire);
  } else {
    module.exports = require_node_gyp_build();
  }
});

// node_modules/tree-sitter/index.js
var require_tree_sitter = __commonJS((exports, module) => {
  var __dirname = "/root/code/HashPilot/node_modules/tree-sitter";
  var binding = require_node_gyp_build2()(__dirname);
  var { Query, Parser, NodeMethods, Tree, TreeCursor, LookaheadIterator } = binding;
  var util = __require("util");
  var { rootNode, rootNodeWithOffset, edit } = Tree.prototype;
  Object.defineProperty(Tree.prototype, "rootNode", {
    get() {
      if (this instanceof Tree && rootNode) {
        return unmarshalNode(rootNode.call(this), this);
      }
    },
    configurable: true
  });
  Tree.prototype.rootNodeWithOffset = function(offset_bytes, offset_extent) {
    return unmarshalNode(rootNodeWithOffset.call(this, offset_bytes, offset_extent.row, offset_extent.column), this);
  };
  Tree.prototype.edit = function(arg) {
    if (this instanceof Tree && edit) {
      edit.call(this, arg.startPosition.row, arg.startPosition.column, arg.oldEndPosition.row, arg.oldEndPosition.column, arg.newEndPosition.row, arg.newEndPosition.column, arg.startIndex, arg.oldEndIndex, arg.newEndIndex);
    }
  };
  Tree.prototype.walk = function() {
    return this.rootNode.walk();
  };

  class SyntaxNode {
    constructor(tree) {
      this.tree = tree;
    }
    [util.inspect.custom]() {
      return this.constructor.name + ` {
` + "  type: " + this.type + `,
` + "  startPosition: " + pointToString(this.startPosition) + `,
` + "  endPosition: " + pointToString(this.endPosition) + `,
` + "  childCount: " + this.childCount + `,
` + "}";
    }
    get id() {
      marshalNode(this);
      return NodeMethods.id(this.tree);
    }
    get typeId() {
      marshalNode(this);
      return NodeMethods.typeId(this.tree);
    }
    get grammarId() {
      marshalNode(this);
      return NodeMethods.grammarId(this.tree);
    }
    get type() {
      marshalNode(this);
      return NodeMethods.type(this.tree);
    }
    get grammarType() {
      marshalNode(this);
      return NodeMethods.grammarType(this.tree);
    }
    get isExtra() {
      marshalNode(this);
      return NodeMethods.isExtra(this.tree);
    }
    get isNamed() {
      marshalNode(this);
      return NodeMethods.isNamed(this.tree);
    }
    get isMissing() {
      marshalNode(this);
      return NodeMethods.isMissing(this.tree);
    }
    get hasChanges() {
      marshalNode(this);
      return NodeMethods.hasChanges(this.tree);
    }
    get hasError() {
      marshalNode(this);
      return NodeMethods.hasError(this.tree);
    }
    get isError() {
      marshalNode(this);
      return NodeMethods.isError(this.tree);
    }
    get text() {
      return this.tree.getText(this);
    }
    get startPosition() {
      marshalNode(this);
      NodeMethods.startPosition(this.tree);
      return unmarshalPoint();
    }
    get endPosition() {
      marshalNode(this);
      NodeMethods.endPosition(this.tree);
      return unmarshalPoint();
    }
    get startIndex() {
      marshalNode(this);
      return NodeMethods.startIndex(this.tree);
    }
    get endIndex() {
      marshalNode(this);
      return NodeMethods.endIndex(this.tree);
    }
    get parent() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.parent(this.tree), this.tree);
    }
    get children() {
      marshalNode(this);
      return unmarshalNodes(NodeMethods.children(this.tree), this.tree);
    }
    get namedChildren() {
      marshalNode(this);
      return unmarshalNodes(NodeMethods.namedChildren(this.tree), this.tree);
    }
    get childCount() {
      marshalNode(this);
      return NodeMethods.childCount(this.tree);
    }
    get namedChildCount() {
      marshalNode(this);
      return NodeMethods.namedChildCount(this.tree);
    }
    get firstChild() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.firstChild(this.tree), this.tree);
    }
    get firstNamedChild() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.firstNamedChild(this.tree), this.tree);
    }
    get lastChild() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.lastChild(this.tree), this.tree);
    }
    get lastNamedChild() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.lastNamedChild(this.tree), this.tree);
    }
    get nextSibling() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.nextSibling(this.tree), this.tree);
    }
    get nextNamedSibling() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.nextNamedSibling(this.tree), this.tree);
    }
    get previousSibling() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.previousSibling(this.tree), this.tree);
    }
    get previousNamedSibling() {
      marshalNode(this);
      return unmarshalNode(NodeMethods.previousNamedSibling(this.tree), this.tree);
    }
    get parseState() {
      marshalNode(this);
      return NodeMethods.parseState(this.tree);
    }
    get nextParseState() {
      marshalNode(this);
      return NodeMethods.nextParseState(this.tree);
    }
    get descendantCount() {
      marshalNode(this);
      return NodeMethods.descendantCount(this.tree);
    }
    toString() {
      marshalNode(this);
      return NodeMethods.toString(this.tree);
    }
    child(index) {
      marshalNode(this);
      return unmarshalNode(NodeMethods.child(this.tree, index), this.tree);
    }
    namedChild(index) {
      marshalNode(this);
      return unmarshalNode(NodeMethods.namedChild(this.tree, index), this.tree);
    }
    childForFieldName(fieldName) {
      marshalNode(this);
      return unmarshalNode(NodeMethods.childForFieldName(this.tree, fieldName), this.tree);
    }
    childForFieldId(fieldId) {
      marshalNode(this);
      return unmarshalNode(NodeMethods.childForFieldId(this.tree, fieldId), this.tree);
    }
    fieldNameForChild(childIndex) {
      marshalNode(this);
      return NodeMethods.fieldNameForChild(this.tree, childIndex);
    }
    childrenForFieldName(fieldName) {
      marshalNode(this);
      return unmarshalNodes(NodeMethods.childrenForFieldName(this.tree, fieldName), this.tree);
    }
    childrenForFieldId(fieldId) {
      marshalNode(this);
      return unmarshalNodes(NodeMethods.childrenForFieldId(this.tree, fieldId), this.tree);
    }
    firstChildForIndex(index) {
      marshalNode(this);
      return unmarshalNode(NodeMethods.firstChildForIndex(this.tree, index), this.tree);
    }
    firstNamedChildForIndex(index) {
      marshalNode(this);
      return unmarshalNode(NodeMethods.firstNamedChildForIndex(this.tree, index), this.tree);
    }
    namedDescendantForIndex(start, end) {
      marshalNode(this);
      if (end == null)
        end = start;
      return unmarshalNode(NodeMethods.namedDescendantForIndex(this.tree, start, end), this.tree);
    }
    descendantForIndex(start, end) {
      marshalNode(this);
      if (end == null)
        end = start;
      return unmarshalNode(NodeMethods.descendantForIndex(this.tree, start, end), this.tree);
    }
    descendantsOfType(types, start, end) {
      marshalNode(this);
      if (typeof types === "string")
        types = [types];
      return unmarshalNodes(NodeMethods.descendantsOfType(this.tree, types, start, end), this.tree);
    }
    namedDescendantForPosition(start, end) {
      marshalNode(this);
      if (end == null)
        end = start;
      return unmarshalNode(NodeMethods.namedDescendantForPosition(this.tree, start, end), this.tree);
    }
    descendantForPosition(start, end) {
      marshalNode(this);
      if (end == null)
        end = start;
      return unmarshalNode(NodeMethods.descendantForPosition(this.tree, start, end), this.tree);
    }
    closest(types) {
      marshalNode(this);
      if (typeof types === "string")
        types = [types];
      return unmarshalNode(NodeMethods.closest(this.tree, types), this.tree);
    }
    walk() {
      marshalNode(this);
      const cursor = NodeMethods.walk(this.tree);
      cursor.tree = this.tree;
      unmarshalNode(cursor.currentNode, this.tree);
      return cursor;
    }
  }
  var { parse, setLanguage } = Parser.prototype;
  var languageSymbol = Symbol("parser.language");
  Parser.prototype.setLanguage = function(language2) {
    if (this instanceof Parser && setLanguage) {
      setLanguage.call(this, language2);
    }
    this[languageSymbol] = language2;
    if (!language2.nodeSubclasses) {
      initializeLanguageNodeClasses(language2);
    }
    return this;
  };
  Parser.prototype.getLanguage = function(_language) {
    return this[languageSymbol] || null;
  };
  Parser.prototype.parse = function(input, oldTree, { bufferSize, includedRanges } = {}) {
    let getText, treeInput = input;
    if (typeof input === "string") {
      const inputString = input;
      input = (offset, _position) => inputString.slice(offset);
      getText = getTextFromString;
    } else {
      getText = getTextFromFunction;
    }
    const tree = this instanceof Parser && parse ? parse.call(this, input, oldTree, bufferSize, includedRanges) : undefined;
    if (tree) {
      tree.input = treeInput;
      tree.getText = getText;
      tree.language = this.getLanguage();
    }
    return tree;
  };
  var { startPosition, endPosition, currentNode } = TreeCursor.prototype;
  Object.defineProperties(TreeCursor.prototype, {
    currentNode: {
      get() {
        if (this instanceof TreeCursor && currentNode) {
          return unmarshalNode(currentNode.call(this), this.tree);
        }
      },
      configurable: true
    },
    startPosition: {
      get() {
        if (this instanceof TreeCursor && startPosition) {
          startPosition.call(this);
          return unmarshalPoint();
        }
      },
      configurable: true
    },
    endPosition: {
      get() {
        if (this instanceof TreeCursor && endPosition) {
          endPosition.call(this);
          return unmarshalPoint();
        }
      },
      configurable: true
    },
    nodeText: {
      get() {
        return this.tree.getText(this);
      },
      configurable: true
    }
  });
  var { _matches, _captures } = Query.prototype;
  var PREDICATE_STEP_TYPE = {
    DONE: 0,
    CAPTURE: 1,
    STRING: 2
  };
  var ZERO_POINT = { row: 0, column: 0 };
  Query.prototype._init = function() {
    const predicateDescriptions = this._getPredicates();
    const patternCount = predicateDescriptions.length;
    const setProperties = new Array(patternCount);
    const assertedProperties = new Array(patternCount);
    const refutedProperties = new Array(patternCount);
    const predicates = new Array(patternCount);
    const FIRST = 0;
    const SECOND = 2;
    const THIRD = 4;
    for (let i = 0;i < predicateDescriptions.length; i++) {
      predicates[i] = [];
      for (let j = 0;j < predicateDescriptions[i].length; j++) {
        const steps = predicateDescriptions[i][j];
        const stepsLength = steps.length / 2;
        if (steps[FIRST] !== PREDICATE_STEP_TYPE.STRING) {
          throw new Error("Predicates must begin with a literal value");
        }
        const operator = steps[FIRST + 1];
        let isPositive = true;
        let matchAll = true;
        let captureName;
        switch (operator) {
          case "any-not-eq?":
          case "not-eq?":
            isPositive = false;
          case "any-eq?":
          case "eq?":
            if (stepsLength !== 3)
              throw new Error(`Wrong number of arguments to \`#eq?\` predicate. Expected 2, got ${stepsLength - 1}`);
            if (steps[SECOND] !== PREDICATE_STEP_TYPE.CAPTURE)
              throw new Error(`First argument of \`#eq?\` predicate must be a capture. Got "${steps[SECOND + 1]}"`);
            matchAll = !operator.startsWith("any-");
            if (steps[THIRD] === PREDICATE_STEP_TYPE.CAPTURE) {
              const captureName1 = steps[SECOND + 1];
              const captureName2 = steps[THIRD + 1];
              predicates[i].push(function(captures) {
                let nodes_1 = [];
                let nodes_2 = [];
                for (const c of captures) {
                  if (c.name === captureName1)
                    nodes_1.push(c.node);
                  if (c.name === captureName2)
                    nodes_2.push(c.node);
                }
                let compare = (n1, n2, positive) => {
                  return positive ? n1.text === n2.text : n1.text !== n2.text;
                };
                return matchAll ? nodes_1.every((n1) => nodes_2.some((n2) => compare(n1, n2, isPositive))) : nodes_1.some((n1) => nodes_2.some((n2) => compare(n1, n2, isPositive)));
              });
            } else {
              captureName = steps[SECOND + 1];
              const stringValue = steps[THIRD + 1];
              let matches = (n2) => n2.text === stringValue;
              let doesNotMatch = (n2) => n2.text !== stringValue;
              predicates[i].push(function(captures) {
                let nodes = [];
                for (const c of captures) {
                  if (c.name === captureName)
                    nodes.push(c.node);
                }
                let test = isPositive ? matches : doesNotMatch;
                return matchAll ? nodes.every(test) : nodes.some(test);
              });
            }
            break;
          case "any-not-match?":
          case "not-match?":
            isPositive = false;
          case "any-match?":
          case "match?":
            if (stepsLength !== 3)
              throw new Error(`Wrong number of arguments to \`#match?\` predicate. Expected 2, got ${stepsLength - 1}.`);
            if (steps[SECOND] !== PREDICATE_STEP_TYPE.CAPTURE)
              throw new Error(`First argument of \`#match?\` predicate must be a capture. Got "${steps[SECOND + 1]}".`);
            if (steps[THIRD] !== PREDICATE_STEP_TYPE.STRING)
              throw new Error(`Second argument of \`#match?\` predicate must be a string. Got @${steps[THIRD + 1]}.`);
            captureName = steps[SECOND + 1];
            const regex = new RegExp(steps[THIRD + 1]);
            matchAll = !operator.startsWith("any-");
            predicates[i].push(function(captures) {
              const nodes = [];
              for (const c of captures) {
                if (c.name === captureName)
                  nodes.push(c.node.text);
              }
              let test = (text, positive) => {
                return positive ? regex.test(text) : !regex.test(text);
              };
              if (nodes.length === 0)
                return !isPositive;
              return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
            });
            break;
          case "set!":
            if (stepsLength < 2 || stepsLength > 3)
              throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${stepsLength - 1}.`);
            if (steps.some((s, i2) => i2 % 2 !== 1 && s !== PREDICATE_STEP_TYPE.STRING))
              throw new Error(`Arguments to \`#set!\` predicate must be a strings.".`);
            if (!setProperties[i])
              setProperties[i] = {};
            setProperties[i][steps[SECOND + 1]] = steps[THIRD] ? steps[THIRD + 1] : null;
            break;
          case "is?":
          case "is-not?":
            if (stepsLength < 2 || stepsLength > 3)
              throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${stepsLength - 1}.`);
            if (steps.some((s, i2) => i2 % 2 !== 1 && s !== PREDICATE_STEP_TYPE.STRING))
              throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
            const properties = operator === "is?" ? assertedProperties : refutedProperties;
            if (!properties[i])
              properties[i] = {};
            properties[i][steps[SECOND + 1]] = steps[THIRD] ? steps[THIRD + 1] : null;
            break;
          case "not-any-of?":
            isPositive = false;
          case "any-of?":
            if (stepsLength < 2)
              throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${stepsLength - 1}.`);
            if (steps[SECOND] !== PREDICATE_STEP_TYPE.CAPTURE)
              throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
            stringValues = [];
            for (let k = THIRD;k < 2 * stepsLength; k += 2) {
              if (steps[k] !== PREDICATE_STEP_TYPE.STRING)
                throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
              stringValues.push(steps[k + 1]);
            }
            captureName = steps[SECOND + 1];
            predicates[i].push(function(captures) {
              const nodes = [];
              for (const c of captures) {
                if (c.name === captureName)
                  nodes.push(c.node.text);
              }
              if (nodes.length === 0)
                return !isPositive;
              return nodes.every((text) => stringValues.includes(text)) === isPositive;
            });
            break;
          default:
            throw new Error(`Unknown query predicate \`#${steps[FIRST + 1]}\``);
        }
      }
    }
    this.predicates = Object.freeze(predicates);
    this.setProperties = Object.freeze(setProperties);
    this.assertedProperties = Object.freeze(assertedProperties);
    this.refutedProperties = Object.freeze(refutedProperties);
  };
  Query.prototype.matches = function(node, {
    startPosition: startPosition2 = ZERO_POINT,
    endPosition: endPosition2 = ZERO_POINT,
    startIndex = 0,
    endIndex = 0,
    matchLimit = 4294967295,
    maxStartDepth = 4294967295
  } = {}) {
    marshalNode(node);
    const [returnedMatches, returnedNodes] = _matches.call(this, node.tree, startPosition2.row, startPosition2.column, endPosition2.row, endPosition2.column, startIndex, endIndex, matchLimit, maxStartDepth);
    const nodes = unmarshalNodes(returnedNodes, node.tree);
    const results = [];
    let i = 0;
    let nodeIndex = 0;
    while (i < returnedMatches.length) {
      const patternIndex = returnedMatches[i++];
      const captures = [];
      while (i < returnedMatches.length && typeof returnedMatches[i] === "string") {
        const captureName = returnedMatches[i++];
        captures.push({
          name: captureName,
          node: nodes[nodeIndex++]
        });
      }
      if (this.predicates[patternIndex].every((p) => p(captures))) {
        const result = { pattern: patternIndex, captures };
        const setProperties = this.setProperties[patternIndex];
        const assertedProperties = this.assertedProperties[patternIndex];
        const refutedProperties = this.refutedProperties[patternIndex];
        if (setProperties)
          result.setProperties = setProperties;
        if (assertedProperties)
          result.assertedProperties = assertedProperties;
        if (refutedProperties)
          result.refutedProperties = refutedProperties;
        results.push(result);
      }
    }
    return results;
  };
  Query.prototype.captures = function(node, {
    startPosition: startPosition2 = ZERO_POINT,
    endPosition: endPosition2 = ZERO_POINT,
    startIndex = 0,
    endIndex = 0,
    matchLimit = 4294967295,
    maxStartDepth = 4294967295
  } = {}) {
    marshalNode(node);
    const [returnedMatches, returnedNodes] = _captures.call(this, node.tree, startPosition2.row, startPosition2.column, endPosition2.row, endPosition2.column, startIndex, endIndex, matchLimit, maxStartDepth);
    const nodes = unmarshalNodes(returnedNodes, node.tree);
    const results = [];
    let i = 0;
    let nodeIndex = 0;
    while (i < returnedMatches.length) {
      const patternIndex = returnedMatches[i++];
      const captureIndex = returnedMatches[i++];
      const captures = [];
      while (i < returnedMatches.length && typeof returnedMatches[i] === "string") {
        const captureName = returnedMatches[i++];
        captures.push({
          name: captureName,
          node: nodes[nodeIndex++]
        });
      }
      if (this.predicates[patternIndex].every((p) => p(captures))) {
        const result = captures[captureIndex];
        const setProperties = this.setProperties[patternIndex];
        const assertedProperties = this.assertedProperties[patternIndex];
        const refutedProperties = this.refutedProperties[patternIndex];
        if (setProperties)
          result.setProperties = setProperties;
        if (assertedProperties)
          result.assertedProperties = assertedProperties;
        if (refutedProperties)
          result.refutedProperties = refutedProperties;
        results.push(result);
      }
    }
    return results;
  };
  LookaheadIterator.prototype[Symbol.iterator] = function() {
    const self = this;
    return {
      next() {
        if (self._next()) {
          return { done: false, value: self.currentType };
        }
        return { done: true, value: "" };
      }
    };
  };
  function getTextFromString(node) {
    return this.input.substring(node.startIndex, node.endIndex);
  }
  function getTextFromFunction({ startIndex, endIndex }) {
    const { input } = this;
    let result = "";
    const goalLength = endIndex - startIndex;
    while (result.length < goalLength) {
      const text = input(startIndex + result.length);
      result += text;
    }
    return result.slice(0, goalLength);
  }
  var { pointTransferArray } = binding;
  var NODE_FIELD_COUNT = 6;
  var ERROR_TYPE_ID = 65535;
  function getID(buffer, offset) {
    const low = BigInt(buffer[offset]);
    const high = BigInt(buffer[offset + 1]);
    return (high << 32n) + low;
  }
  function unmarshalNode(value, tree, offset = 0, cache = null) {
    if (typeof value === "object") {
      const node = value;
      return node;
    }
    const nodeTypeId = value;
    const NodeClass = nodeTypeId === ERROR_TYPE_ID ? SyntaxNode : tree.language.nodeSubclasses[nodeTypeId];
    const { nodeTransferArray } = binding;
    const id2 = getID(nodeTransferArray, offset);
    if (id2 === 0n) {
      return null;
    }
    let cachedResult;
    if (cache && (cachedResult = cache.get(id2)))
      return cachedResult;
    const result = new NodeClass(tree);
    for (let i = 0;i < NODE_FIELD_COUNT; i++) {
      result[i] = nodeTransferArray[offset + i];
    }
    if (cache)
      cache.set(id2, result);
    else
      tree._cacheNode(result);
    return result;
  }
  function unmarshalNodes(nodes, tree) {
    const cache = new Map;
    let offset = 0;
    for (let i = 0, { length } = nodes;i < length; i++) {
      const node = unmarshalNode(nodes[i], tree, offset, cache);
      if (node !== nodes[i]) {
        nodes[i] = node;
        offset += NODE_FIELD_COUNT;
      }
    }
    tree._cacheNodes(Array.from(cache.values()));
    return nodes;
  }
  function marshalNode(node) {
    if (!(node.tree instanceof Tree)) {
      throw new TypeError("SyntaxNode must belong to a Tree");
    }
    const { nodeTransferArray } = binding;
    for (let i = 0;i < NODE_FIELD_COUNT; i++) {
      nodeTransferArray[i] = node[i];
    }
  }
  function unmarshalPoint() {
    return { row: pointTransferArray[0], column: pointTransferArray[1] };
  }
  function pointToString(point) {
    return `{row: ${point.row}, column: ${point.column}}`;
  }
  function initializeLanguageNodeClasses(language) {
    const nodeTypeNamesById = binding.getNodeTypeNamesById(language);
    const nodeFieldNamesById = binding.getNodeFieldNamesById(language);
    const nodeTypeInfo = language.nodeTypeInfo || [];
    const nodeSubclasses = [];
    for (let id = 0, n = nodeTypeNamesById.length;id < n; id++) {
      nodeSubclasses[id] = SyntaxNode;
      const typeName = nodeTypeNamesById[id];
      if (!typeName)
        continue;
      const typeInfo = nodeTypeInfo.find((info) => info.named && info.type === typeName);
      if (!typeInfo)
        continue;
      const fieldNames = [];
      let classBody = `
`;
      if (typeInfo.fields) {
        for (const fieldName in typeInfo.fields) {
          const fieldId = nodeFieldNamesById.indexOf(fieldName);
          if (fieldId === -1)
            continue;
          if (typeInfo.fields[fieldName].multiple) {
            const getterName = camelCase(fieldName) + "Nodes";
            fieldNames.push(getterName);
            classBody += `
            get ${getterName}() {
              marshalNode(this);
              return unmarshalNodes(NodeMethods.childNodesForFieldId(this.tree, ${fieldId}), this.tree);
            }
          `.replace(/\s+/g, " ") + `
`;
          } else {
            const getterName = camelCase(fieldName, false) + "Node";
            fieldNames.push(getterName);
            classBody += `
            get ${getterName}() {
              marshalNode(this);
              return unmarshalNode(NodeMethods.childNodeForFieldId(this.tree, ${fieldId}), this.tree);
            }
          `.replace(/\s+/g, " ") + `
`;
          }
        }
      }
      const className = camelCase(typeName, true) + "Node";
      const nodeSubclass = eval(`class ${className} extends SyntaxNode {${classBody}}; ${className}`);
      nodeSubclass.prototype.type = typeName;
      nodeSubclass.prototype.fields = Object.freeze(fieldNames.sort());
      nodeSubclasses[id] = nodeSubclass;
    }
    language.nodeSubclasses = nodeSubclasses;
  }
  function camelCase(name, upperCase) {
    name = name.replace(/_(\w)/g, (_match, letter) => letter.toUpperCase());
    if (upperCase)
      name = name[0].toUpperCase() + name.slice(1);
    return name;
  }
  module.exports = Parser;
  module.exports.Query = Query;
  module.exports.Tree = Tree;
  module.exports.SyntaxNode = SyntaxNode;
  module.exports.TreeCursor = TreeCursor;
  module.exports.LookaheadIterator = LookaheadIterator;
});

// node_modules/tree-sitter-typescript/typescript/src/node-types.json
var require_node_types = __commonJS((exports, module) => {
  module.exports = [
    {
      type: "declaration",
      named: true,
      subtypes: [
        {
          type: "abstract_class_declaration",
          named: true
        },
        {
          type: "ambient_declaration",
          named: true
        },
        {
          type: "class_declaration",
          named: true
        },
        {
          type: "enum_declaration",
          named: true
        },
        {
          type: "function_declaration",
          named: true
        },
        {
          type: "function_signature",
          named: true
        },
        {
          type: "generator_function_declaration",
          named: true
        },
        {
          type: "import_alias",
          named: true
        },
        {
          type: "interface_declaration",
          named: true
        },
        {
          type: "internal_module",
          named: true
        },
        {
          type: "lexical_declaration",
          named: true
        },
        {
          type: "module",
          named: true
        },
        {
          type: "type_alias_declaration",
          named: true
        },
        {
          type: "variable_declaration",
          named: true
        }
      ]
    },
    {
      type: "expression",
      named: true,
      subtypes: [
        {
          type: "as_expression",
          named: true
        },
        {
          type: "assignment_expression",
          named: true
        },
        {
          type: "augmented_assignment_expression",
          named: true
        },
        {
          type: "await_expression",
          named: true
        },
        {
          type: "binary_expression",
          named: true
        },
        {
          type: "glimmer_template",
          named: true
        },
        {
          type: "instantiation_expression",
          named: true
        },
        {
          type: "internal_module",
          named: true
        },
        {
          type: "new_expression",
          named: true
        },
        {
          type: "primary_expression",
          named: true
        },
        {
          type: "satisfies_expression",
          named: true
        },
        {
          type: "ternary_expression",
          named: true
        },
        {
          type: "type_assertion",
          named: true
        },
        {
          type: "unary_expression",
          named: true
        },
        {
          type: "update_expression",
          named: true
        },
        {
          type: "yield_expression",
          named: true
        }
      ]
    },
    {
      type: "pattern",
      named: true,
      subtypes: [
        {
          type: "array_pattern",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "non_null_expression",
          named: true
        },
        {
          type: "object_pattern",
          named: true
        },
        {
          type: "rest_pattern",
          named: true
        },
        {
          type: "subscript_expression",
          named: true
        },
        {
          type: "undefined",
          named: true
        }
      ]
    },
    {
      type: "primary_expression",
      named: true,
      subtypes: [
        {
          type: "array",
          named: true
        },
        {
          type: "arrow_function",
          named: true
        },
        {
          type: "call_expression",
          named: true
        },
        {
          type: "class",
          named: true
        },
        {
          type: "false",
          named: true
        },
        {
          type: "function_expression",
          named: true
        },
        {
          type: "generator_function",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "meta_property",
          named: true
        },
        {
          type: "non_null_expression",
          named: true
        },
        {
          type: "null",
          named: true
        },
        {
          type: "number",
          named: true
        },
        {
          type: "object",
          named: true
        },
        {
          type: "parenthesized_expression",
          named: true
        },
        {
          type: "regex",
          named: true
        },
        {
          type: "string",
          named: true
        },
        {
          type: "subscript_expression",
          named: true
        },
        {
          type: "super",
          named: true
        },
        {
          type: "template_string",
          named: true
        },
        {
          type: "this",
          named: true
        },
        {
          type: "true",
          named: true
        },
        {
          type: "undefined",
          named: true
        }
      ]
    },
    {
      type: "primary_type",
      named: true,
      subtypes: [
        {
          type: "array_type",
          named: true
        },
        {
          type: "conditional_type",
          named: true
        },
        {
          type: "const",
          named: false
        },
        {
          type: "existential_type",
          named: true
        },
        {
          type: "flow_maybe_type",
          named: true
        },
        {
          type: "generic_type",
          named: true
        },
        {
          type: "index_type_query",
          named: true
        },
        {
          type: "intersection_type",
          named: true
        },
        {
          type: "literal_type",
          named: true
        },
        {
          type: "lookup_type",
          named: true
        },
        {
          type: "nested_type_identifier",
          named: true
        },
        {
          type: "object_type",
          named: true
        },
        {
          type: "parenthesized_type",
          named: true
        },
        {
          type: "predefined_type",
          named: true
        },
        {
          type: "template_literal_type",
          named: true
        },
        {
          type: "this_type",
          named: true
        },
        {
          type: "tuple_type",
          named: true
        },
        {
          type: "type_identifier",
          named: true
        },
        {
          type: "type_query",
          named: true
        },
        {
          type: "union_type",
          named: true
        }
      ]
    },
    {
      type: "statement",
      named: true,
      subtypes: [
        {
          type: "break_statement",
          named: true
        },
        {
          type: "continue_statement",
          named: true
        },
        {
          type: "debugger_statement",
          named: true
        },
        {
          type: "declaration",
          named: true
        },
        {
          type: "do_statement",
          named: true
        },
        {
          type: "empty_statement",
          named: true
        },
        {
          type: "export_statement",
          named: true
        },
        {
          type: "expression_statement",
          named: true
        },
        {
          type: "for_in_statement",
          named: true
        },
        {
          type: "for_statement",
          named: true
        },
        {
          type: "if_statement",
          named: true
        },
        {
          type: "import_statement",
          named: true
        },
        {
          type: "labeled_statement",
          named: true
        },
        {
          type: "return_statement",
          named: true
        },
        {
          type: "statement_block",
          named: true
        },
        {
          type: "switch_statement",
          named: true
        },
        {
          type: "throw_statement",
          named: true
        },
        {
          type: "try_statement",
          named: true
        },
        {
          type: "while_statement",
          named: true
        },
        {
          type: "with_statement",
          named: true
        }
      ]
    },
    {
      type: "type",
      named: true,
      subtypes: [
        {
          type: "call_expression",
          named: true
        },
        {
          type: "constructor_type",
          named: true
        },
        {
          type: "function_type",
          named: true
        },
        {
          type: "infer_type",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "primary_type",
          named: true
        },
        {
          type: "readonly_type",
          named: true
        }
      ]
    },
    {
      type: "abstract_class_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "abstract_method_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "accessibility_modifier",
      named: true,
      fields: {}
    },
    {
      type: "adding_type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "ambient_declaration",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "declaration",
            named: true
          },
          {
            type: "property_identifier",
            named: true
          },
          {
            type: "statement_block",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "array",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "array_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "assignment_pattern",
            named: true
          },
          {
            type: "pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "array_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "arrow_function",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        parameter: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "as_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "asserts",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "this",
            named: true
          },
          {
            type: "type_predicate",
            named: true
          }
        ]
      }
    },
    {
      type: "asserts_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "asserts",
            named: true
          }
        ]
      }
    },
    {
      type: "assignment_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "non_null_expression",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            },
            {
              type: "undefined",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "assignment_pattern",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pattern",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "augmented_assignment_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "non_null_expression",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "%=",
              named: false
            },
            {
              type: "&&=",
              named: false
            },
            {
              type: "&=",
              named: false
            },
            {
              type: "**=",
              named: false
            },
            {
              type: "*=",
              named: false
            },
            {
              type: "+=",
              named: false
            },
            {
              type: "-=",
              named: false
            },
            {
              type: "/=",
              named: false
            },
            {
              type: "<<=",
              named: false
            },
            {
              type: ">>=",
              named: false
            },
            {
              type: ">>>=",
              named: false
            },
            {
              type: "??=",
              named: false
            },
            {
              type: "^=",
              named: false
            },
            {
              type: "|=",
              named: false
            },
            {
              type: "||=",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "await_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "binary_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!=",
              named: false
            },
            {
              type: "!==",
              named: false
            },
            {
              type: "%",
              named: false
            },
            {
              type: "&",
              named: false
            },
            {
              type: "&&",
              named: false
            },
            {
              type: "*",
              named: false
            },
            {
              type: "**",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "/",
              named: false
            },
            {
              type: "<",
              named: false
            },
            {
              type: "<<",
              named: false
            },
            {
              type: "<=",
              named: false
            },
            {
              type: "==",
              named: false
            },
            {
              type: "===",
              named: false
            },
            {
              type: ">",
              named: false
            },
            {
              type: ">=",
              named: false
            },
            {
              type: ">>",
              named: false
            },
            {
              type: ">>>",
              named: false
            },
            {
              type: "??",
              named: false
            },
            {
              type: "^",
              named: false
            },
            {
              type: "in",
              named: false
            },
            {
              type: "instanceof",
              named: false
            },
            {
              type: "|",
              named: false
            },
            {
              type: "||",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "break_statement",
      named: true,
      fields: {
        label: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "call_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "arguments",
              named: true
            },
            {
              type: "template_string",
              named: true
            }
          ]
        },
        function: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "import",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "call_signature",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "catch_clause",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        parameter: {
          multiple: false,
          required: false,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "class",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "class_body",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "abstract_method_signature",
            named: true
          },
          {
            type: "class_static_block",
            named: true
          },
          {
            type: "index_signature",
            named: true
          },
          {
            type: "method_definition",
            named: true
          },
          {
            type: "method_signature",
            named: true
          },
          {
            type: "public_field_definition",
            named: true
          }
        ]
      }
    },
    {
      type: "class_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "class_heritage",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "extends_clause",
            named: true
          },
          {
            type: "implements_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "class_static_block",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "computed_property_name",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "conditional_type",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "constraint",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "construct_signature",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "constructor_type",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "continue_statement",
      named: true,
      fields: {
        label: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "debugger_statement",
      named: true,
      fields: {}
    },
    {
      type: "decorator",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "call_expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "member_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "default_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "do_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "else_clause",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "empty_statement",
      named: true,
      fields: {}
    },
    {
      type: "enum_assignment",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "enum_body",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: false,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "enum_assignment",
            named: true
          }
        ]
      }
    },
    {
      type: "enum_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "enum_body",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "existential_type",
      named: true,
      fields: {}
    },
    {
      type: "export_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "export_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "export_specifier",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "export_statement",
      named: true,
      fields: {
        declaration: {
          multiple: false,
          required: false,
          types: [
            {
              type: "declaration",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        source: {
          multiple: false,
          required: false,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "export_clause",
            named: true
          },
          {
            type: "expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "namespace_export",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "extends_clause",
      named: true,
      fields: {
        type_arguments: {
          multiple: true,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        },
        value: {
          multiple: true,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "extends_type_clause",
      named: true,
      fields: {
        type: {
          multiple: true,
          required: true,
          types: [
            {
              type: "generic_type",
              named: true
            },
            {
              type: "nested_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "finally_clause",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "flow_maybe_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "for_in_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        kind: {
          multiple: false,
          required: false,
          types: [
            {
              type: "const",
              named: false
            },
            {
              type: "let",
              named: false
            },
            {
              type: "var",
              named: false
            }
          ]
        },
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "non_null_expression",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            },
            {
              type: "undefined",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "in",
              named: false
            },
            {
              type: "of",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "for_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "empty_statement",
              named: true
            },
            {
              type: "expression_statement",
              named: true
            }
          ]
        },
        increment: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        },
        initializer: {
          multiple: false,
          required: true,
          types: [
            {
              type: "empty_statement",
              named: true
            },
            {
              type: "expression_statement",
              named: true
            },
            {
              type: "lexical_declaration",
              named: true
            },
            {
              type: "variable_declaration",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "formal_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "optional_parameter",
            named: true
          },
          {
            type: "required_parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "function_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_type",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "asserts",
              named: true
            },
            {
              type: "type",
              named: true
            },
            {
              type: "type_predicate",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generator_function",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generator_function_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generic_type",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "nested_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "glimmer_template",
      named: true,
      fields: {
        close_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "glimmer_closing_tag",
              named: true
            }
          ]
        },
        open_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "glimmer_opening_tag",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "identifier",
      named: true,
      fields: {}
    },
    {
      type: "if_statement",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "else_clause",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "implements_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "import",
      named: true,
      fields: {}
    },
    {
      type: "import_alias",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "nested_identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "import_attribute",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "object",
            named: true
          }
        ]
      }
    },
    {
      type: "import_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "named_imports",
            named: true
          },
          {
            type: "namespace_import",
            named: true
          }
        ]
      }
    },
    {
      type: "import_require_clause",
      named: true,
      fields: {
        source: {
          multiple: false,
          required: true,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "import_specifier",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "import_statement",
      named: true,
      fields: {
        source: {
          multiple: false,
          required: false,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "import_attribute",
            named: true
          },
          {
            type: "import_clause",
            named: true
          },
          {
            type: "import_require_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "index_signature",
      named: true,
      fields: {
        index_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        sign: {
          multiple: false,
          required: false,
          types: [
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "adding_type_annotation",
              named: true
            },
            {
              type: "omitting_type_annotation",
              named: true
            },
            {
              type: "opting_type_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mapped_type_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "index_type_query",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "infer_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          },
          {
            type: "type_identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "instantiation_expression",
      named: true,
      fields: {
        function: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "import",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "interface_body",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "call_signature",
            named: true
          },
          {
            type: "construct_signature",
            named: true
          },
          {
            type: "export_statement",
            named: true
          },
          {
            type: "index_signature",
            named: true
          },
          {
            type: "method_signature",
            named: true
          },
          {
            type: "property_signature",
            named: true
          }
        ]
      }
    },
    {
      type: "interface_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "interface_body",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "extends_type_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "internal_module",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "nested_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "intersection_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_attribute",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "jsx_element",
            named: true
          },
          {
            type: "jsx_expression",
            named: true
          },
          {
            type: "jsx_namespace_name",
            named: true
          },
          {
            type: "jsx_self_closing_element",
            named: true
          },
          {
            type: "property_identifier",
            named: true
          },
          {
            type: "string",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_closing_element",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_element",
      named: true,
      fields: {
        close_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "jsx_closing_element",
              named: true
            }
          ]
        },
        open_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "jsx_opening_element",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "html_character_reference",
            named: true
          },
          {
            type: "jsx_element",
            named: true
          },
          {
            type: "jsx_expression",
            named: true
          },
          {
            type: "jsx_self_closing_element",
            named: true
          },
          {
            type: "jsx_text",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_namespace_name",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_opening_element",
      named: true,
      fields: {
        attribute: {
          multiple: true,
          required: false,
          types: [
            {
              type: "jsx_attribute",
              named: true
            },
            {
              type: "jsx_expression",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_self_closing_element",
      named: true,
      fields: {
        attribute: {
          multiple: true,
          required: false,
          types: [
            {
              type: "jsx_attribute",
              named: true
            },
            {
              type: "jsx_expression",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_text",
      named: true,
      fields: {}
    },
    {
      type: "labeled_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        label: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "lexical_declaration",
      named: true,
      fields: {
        kind: {
          multiple: false,
          required: true,
          types: [
            {
              type: "const",
              named: false
            },
            {
              type: "let",
              named: false
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "variable_declarator",
            named: true
          }
        ]
      }
    },
    {
      type: "literal_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "false",
            named: true
          },
          {
            type: "null",
            named: true
          },
          {
            type: "number",
            named: true
          },
          {
            type: "string",
            named: true
          },
          {
            type: "true",
            named: true
          },
          {
            type: "unary_expression",
            named: true
          },
          {
            type: "undefined",
            named: true
          }
        ]
      }
    },
    {
      type: "lookup_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "mapped_type_clause",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "member_expression",
      named: true,
      fields: {
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "import",
              named: true
            }
          ]
        },
        optional_chain: {
          multiple: false,
          required: false,
          types: [
            {
              type: "optional_chain",
              named: true
            }
          ]
        },
        property: {
          multiple: false,
          required: true,
          types: [
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "meta_property",
      named: true,
      fields: {}
    },
    {
      type: "method_definition",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "method_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "module",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "nested_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "named_imports",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "import_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "namespace_export",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "string",
            named: true
          }
        ]
      }
    },
    {
      type: "namespace_import",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "nested_identifier",
      named: true,
      fields: {
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        },
        property: {
          multiple: false,
          required: true,
          types: [
            {
              type: "property_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "nested_type_identifier",
      named: true,
      fields: {
        module: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "nested_identifier",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "new_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "arguments",
              named: true
            }
          ]
        },
        constructor: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "non_null_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "object",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "method_definition",
            named: true
          },
          {
            type: "pair",
            named: true
          },
          {
            type: "shorthand_property_identifier",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "object_assignment_pattern",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "shorthand_property_identifier_pattern",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "object_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "object_assignment_pattern",
            named: true
          },
          {
            type: "pair_pattern",
            named: true
          },
          {
            type: "rest_pattern",
            named: true
          },
          {
            type: "shorthand_property_identifier_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "object_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "call_signature",
            named: true
          },
          {
            type: "construct_signature",
            named: true
          },
          {
            type: "export_statement",
            named: true
          },
          {
            type: "index_signature",
            named: true
          },
          {
            type: "method_signature",
            named: true
          },
          {
            type: "property_signature",
            named: true
          }
        ]
      }
    },
    {
      type: "omitting_type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "opting_type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "optional_chain",
      named: true,
      fields: {}
    },
    {
      type: "optional_parameter",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: false,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "this",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "optional_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "override_modifier",
      named: true,
      fields: {}
    },
    {
      type: "pair",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "pair_pattern",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "assignment_pattern",
              named: true
            },
            {
              type: "pattern",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "parenthesized_expression",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "parenthesized_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "predefined_type",
      named: true,
      fields: {}
    },
    {
      type: "program",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "hash_bang_line",
            named: true
          },
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "property_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "public_field_definition",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "readonly_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "regex",
      named: true,
      fields: {
        flags: {
          multiple: false,
          required: false,
          types: [
            {
              type: "regex_flags",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "regex_pattern",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "required_parameter",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "rest_pattern",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: false,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "this",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "rest_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "array_pattern",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "member_expression",
            named: true
          },
          {
            type: "non_null_expression",
            named: true
          },
          {
            type: "object_pattern",
            named: true
          },
          {
            type: "subscript_expression",
            named: true
          },
          {
            type: "undefined",
            named: true
          }
        ]
      }
    },
    {
      type: "rest_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "return_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "satisfies_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "sequence_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "spread_element",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "statement_block",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          },
          {
            type: "html_character_reference",
            named: true
          },
          {
            type: "string_fragment",
            named: true
          }
        ]
      }
    },
    {
      type: "subscript_expression",
      named: true,
      fields: {
        index: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "predefined_type",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        optional_chain: {
          multiple: false,
          required: false,
          types: [
            {
              type: "optional_chain",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_body",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "switch_case",
            named: true
          },
          {
            type: "switch_default",
            named: true
          }
        ]
      }
    },
    {
      type: "switch_case",
      named: true,
      fields: {
        body: {
          multiple: true,
          required: false,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_default",
      named: true,
      fields: {
        body: {
          multiple: true,
          required: false,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "switch_body",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "template_literal_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "string_fragment",
            named: true
          },
          {
            type: "template_type",
            named: true
          }
        ]
      }
    },
    {
      type: "template_string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          },
          {
            type: "string_fragment",
            named: true
          },
          {
            type: "template_substitution",
            named: true
          }
        ]
      }
    },
    {
      type: "template_substitution",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "template_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "infer_type",
            named: true
          },
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "ternary_expression",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "throw_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "try_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        finalizer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "finally_clause",
              named: true
            }
          ]
        },
        handler: {
          multiple: false,
          required: false,
          types: [
            {
              type: "catch_clause",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "tuple_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "optional_parameter",
            named: true
          },
          {
            type: "optional_type",
            named: true
          },
          {
            type: "required_parameter",
            named: true
          },
          {
            type: "rest_type",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_alias_declaration",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_assertion",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "type_arguments",
            named: true
          }
        ]
      }
    },
    {
      type: "type_parameter",
      named: true,
      fields: {
        constraint: {
          multiple: false,
          required: false,
          types: [
            {
              type: "constraint",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "default_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type_parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "type_predicate",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "this",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_predicate_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type_predicate",
            named: true
          }
        ]
      }
    },
    {
      type: "type_query",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "call_expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "instantiation_expression",
            named: true
          },
          {
            type: "member_expression",
            named: true
          },
          {
            type: "subscript_expression",
            named: true
          },
          {
            type: "this",
            named: true
          }
        ]
      }
    },
    {
      type: "unary_expression",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "number",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "delete",
              named: false
            },
            {
              type: "typeof",
              named: false
            },
            {
              type: "void",
              named: false
            },
            {
              type: "~",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "union_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "update_expression",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "++",
              named: false
            },
            {
              type: "--",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "variable_declaration",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "variable_declarator",
            named: true
          }
        ]
      }
    },
    {
      type: "variable_declarator",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "while_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "with_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "yield_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "!",
      named: false
    },
    {
      type: "!=",
      named: false
    },
    {
      type: "!==",
      named: false
    },
    {
      type: '"',
      named: false
    },
    {
      type: "${",
      named: false
    },
    {
      type: "%",
      named: false
    },
    {
      type: "%=",
      named: false
    },
    {
      type: "&",
      named: false
    },
    {
      type: "&&",
      named: false
    },
    {
      type: "&&=",
      named: false
    },
    {
      type: "&=",
      named: false
    },
    {
      type: "'",
      named: false
    },
    {
      type: "(",
      named: false
    },
    {
      type: ")",
      named: false
    },
    {
      type: "*",
      named: false
    },
    {
      type: "**",
      named: false
    },
    {
      type: "**=",
      named: false
    },
    {
      type: "*=",
      named: false
    },
    {
      type: "+",
      named: false
    },
    {
      type: "++",
      named: false
    },
    {
      type: "+=",
      named: false
    },
    {
      type: "+?:",
      named: false
    },
    {
      type: ",",
      named: false
    },
    {
      type: "-",
      named: false
    },
    {
      type: "--",
      named: false
    },
    {
      type: "-=",
      named: false
    },
    {
      type: "-?:",
      named: false
    },
    {
      type: ".",
      named: false
    },
    {
      type: "...",
      named: false
    },
    {
      type: "/",
      named: false
    },
    {
      type: "/=",
      named: false
    },
    {
      type: "/>",
      named: false
    },
    {
      type: ":",
      named: false
    },
    {
      type: ";",
      named: false
    },
    {
      type: "<",
      named: false
    },
    {
      type: "</",
      named: false
    },
    {
      type: "<<",
      named: false
    },
    {
      type: "<<=",
      named: false
    },
    {
      type: "<=",
      named: false
    },
    {
      type: "=",
      named: false
    },
    {
      type: "==",
      named: false
    },
    {
      type: "===",
      named: false
    },
    {
      type: "=>",
      named: false
    },
    {
      type: ">",
      named: false
    },
    {
      type: ">=",
      named: false
    },
    {
      type: ">>",
      named: false
    },
    {
      type: ">>=",
      named: false
    },
    {
      type: ">>>",
      named: false
    },
    {
      type: ">>>=",
      named: false
    },
    {
      type: "?",
      named: false
    },
    {
      type: "?.",
      named: false
    },
    {
      type: "?:",
      named: false
    },
    {
      type: "??",
      named: false
    },
    {
      type: "??=",
      named: false
    },
    {
      type: "@",
      named: false
    },
    {
      type: "[",
      named: false
    },
    {
      type: "]",
      named: false
    },
    {
      type: "^",
      named: false
    },
    {
      type: "^=",
      named: false
    },
    {
      type: "`",
      named: false
    },
    {
      type: "abstract",
      named: false
    },
    {
      type: "accessor",
      named: false
    },
    {
      type: "any",
      named: false
    },
    {
      type: "as",
      named: false
    },
    {
      type: "asserts",
      named: false
    },
    {
      type: "async",
      named: false
    },
    {
      type: "await",
      named: false
    },
    {
      type: "boolean",
      named: false
    },
    {
      type: "break",
      named: false
    },
    {
      type: "case",
      named: false
    },
    {
      type: "catch",
      named: false
    },
    {
      type: "class",
      named: false
    },
    {
      type: "comment",
      named: true
    },
    {
      type: "const",
      named: false
    },
    {
      type: "continue",
      named: false
    },
    {
      type: "debugger",
      named: false
    },
    {
      type: "declare",
      named: false
    },
    {
      type: "default",
      named: false
    },
    {
      type: "delete",
      named: false
    },
    {
      type: "do",
      named: false
    },
    {
      type: "else",
      named: false
    },
    {
      type: "enum",
      named: false
    },
    {
      type: "escape_sequence",
      named: true
    },
    {
      type: "export",
      named: false
    },
    {
      type: "extends",
      named: false
    },
    {
      type: "false",
      named: true
    },
    {
      type: "finally",
      named: false
    },
    {
      type: "for",
      named: false
    },
    {
      type: "from",
      named: false
    },
    {
      type: "function",
      named: false
    },
    {
      type: "get",
      named: false
    },
    {
      type: "glimmer_closing_tag",
      named: true
    },
    {
      type: "glimmer_opening_tag",
      named: true
    },
    {
      type: "global",
      named: false
    },
    {
      type: "hash_bang_line",
      named: true
    },
    {
      type: "html_character_reference",
      named: true
    },
    {
      type: "html_comment",
      named: true
    },
    {
      type: "if",
      named: false
    },
    {
      type: "implements",
      named: false
    },
    {
      type: "import",
      named: false
    },
    {
      type: "in",
      named: false
    },
    {
      type: "infer",
      named: false
    },
    {
      type: "instanceof",
      named: false
    },
    {
      type: "interface",
      named: false
    },
    {
      type: "is",
      named: false
    },
    {
      type: "keyof",
      named: false
    },
    {
      type: "let",
      named: false
    },
    {
      type: "module",
      named: false
    },
    {
      type: "namespace",
      named: false
    },
    {
      type: "never",
      named: false
    },
    {
      type: "new",
      named: false
    },
    {
      type: "null",
      named: true
    },
    {
      type: "number",
      named: true
    },
    {
      type: "number",
      named: false
    },
    {
      type: "object",
      named: false
    },
    {
      type: "of",
      named: false
    },
    {
      type: "override",
      named: false
    },
    {
      type: "private",
      named: false
    },
    {
      type: "private_property_identifier",
      named: true
    },
    {
      type: "property_identifier",
      named: true
    },
    {
      type: "protected",
      named: false
    },
    {
      type: "public",
      named: false
    },
    {
      type: "readonly",
      named: false
    },
    {
      type: "regex_flags",
      named: true
    },
    {
      type: "regex_pattern",
      named: true
    },
    {
      type: "require",
      named: false
    },
    {
      type: "return",
      named: false
    },
    {
      type: "satisfies",
      named: false
    },
    {
      type: "set",
      named: false
    },
    {
      type: "shorthand_property_identifier",
      named: true
    },
    {
      type: "shorthand_property_identifier_pattern",
      named: true
    },
    {
      type: "statement_identifier",
      named: true
    },
    {
      type: "static",
      named: false
    },
    {
      type: "string",
      named: false
    },
    {
      type: "string_fragment",
      named: true
    },
    {
      type: "super",
      named: true
    },
    {
      type: "switch",
      named: false
    },
    {
      type: "symbol",
      named: false
    },
    {
      type: "target",
      named: false
    },
    {
      type: "this",
      named: true
    },
    {
      type: "this_type",
      named: true
    },
    {
      type: "throw",
      named: false
    },
    {
      type: "true",
      named: true
    },
    {
      type: "try",
      named: false
    },
    {
      type: "type",
      named: false
    },
    {
      type: "type_identifier",
      named: true
    },
    {
      type: "typeof",
      named: false
    },
    {
      type: "undefined",
      named: true
    },
    {
      type: "unique symbol",
      named: false
    },
    {
      type: "unknown",
      named: false
    },
    {
      type: "using",
      named: false
    },
    {
      type: "var",
      named: false
    },
    {
      type: "void",
      named: false
    },
    {
      type: "while",
      named: false
    },
    {
      type: "with",
      named: false
    },
    {
      type: "yield",
      named: false
    },
    {
      type: "{",
      named: false
    },
    {
      type: "{|",
      named: false
    },
    {
      type: "|",
      named: false
    },
    {
      type: "|=",
      named: false
    },
    {
      type: "||",
      named: false
    },
    {
      type: "||=",
      named: false
    },
    {
      type: "|}",
      named: false
    },
    {
      type: "}",
      named: false
    },
    {
      type: "~",
      named: false
    }
  ];
});

// node_modules/tree-sitter-typescript/tsx/src/node-types.json
var require_node_types2 = __commonJS((exports, module) => {
  module.exports = [
    {
      type: "declaration",
      named: true,
      subtypes: [
        {
          type: "abstract_class_declaration",
          named: true
        },
        {
          type: "ambient_declaration",
          named: true
        },
        {
          type: "class_declaration",
          named: true
        },
        {
          type: "enum_declaration",
          named: true
        },
        {
          type: "function_declaration",
          named: true
        },
        {
          type: "function_signature",
          named: true
        },
        {
          type: "generator_function_declaration",
          named: true
        },
        {
          type: "import_alias",
          named: true
        },
        {
          type: "interface_declaration",
          named: true
        },
        {
          type: "internal_module",
          named: true
        },
        {
          type: "lexical_declaration",
          named: true
        },
        {
          type: "module",
          named: true
        },
        {
          type: "type_alias_declaration",
          named: true
        },
        {
          type: "variable_declaration",
          named: true
        }
      ]
    },
    {
      type: "expression",
      named: true,
      subtypes: [
        {
          type: "as_expression",
          named: true
        },
        {
          type: "assignment_expression",
          named: true
        },
        {
          type: "augmented_assignment_expression",
          named: true
        },
        {
          type: "await_expression",
          named: true
        },
        {
          type: "binary_expression",
          named: true
        },
        {
          type: "glimmer_template",
          named: true
        },
        {
          type: "instantiation_expression",
          named: true
        },
        {
          type: "internal_module",
          named: true
        },
        {
          type: "jsx_element",
          named: true
        },
        {
          type: "jsx_self_closing_element",
          named: true
        },
        {
          type: "new_expression",
          named: true
        },
        {
          type: "primary_expression",
          named: true
        },
        {
          type: "satisfies_expression",
          named: true
        },
        {
          type: "ternary_expression",
          named: true
        },
        {
          type: "unary_expression",
          named: true
        },
        {
          type: "update_expression",
          named: true
        },
        {
          type: "yield_expression",
          named: true
        }
      ]
    },
    {
      type: "pattern",
      named: true,
      subtypes: [
        {
          type: "array_pattern",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "non_null_expression",
          named: true
        },
        {
          type: "object_pattern",
          named: true
        },
        {
          type: "rest_pattern",
          named: true
        },
        {
          type: "subscript_expression",
          named: true
        },
        {
          type: "undefined",
          named: true
        }
      ]
    },
    {
      type: "primary_expression",
      named: true,
      subtypes: [
        {
          type: "array",
          named: true
        },
        {
          type: "arrow_function",
          named: true
        },
        {
          type: "call_expression",
          named: true
        },
        {
          type: "class",
          named: true
        },
        {
          type: "false",
          named: true
        },
        {
          type: "function_expression",
          named: true
        },
        {
          type: "generator_function",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "meta_property",
          named: true
        },
        {
          type: "non_null_expression",
          named: true
        },
        {
          type: "null",
          named: true
        },
        {
          type: "number",
          named: true
        },
        {
          type: "object",
          named: true
        },
        {
          type: "parenthesized_expression",
          named: true
        },
        {
          type: "regex",
          named: true
        },
        {
          type: "string",
          named: true
        },
        {
          type: "subscript_expression",
          named: true
        },
        {
          type: "super",
          named: true
        },
        {
          type: "template_string",
          named: true
        },
        {
          type: "this",
          named: true
        },
        {
          type: "true",
          named: true
        },
        {
          type: "undefined",
          named: true
        }
      ]
    },
    {
      type: "primary_type",
      named: true,
      subtypes: [
        {
          type: "array_type",
          named: true
        },
        {
          type: "conditional_type",
          named: true
        },
        {
          type: "const",
          named: false
        },
        {
          type: "existential_type",
          named: true
        },
        {
          type: "flow_maybe_type",
          named: true
        },
        {
          type: "generic_type",
          named: true
        },
        {
          type: "index_type_query",
          named: true
        },
        {
          type: "intersection_type",
          named: true
        },
        {
          type: "literal_type",
          named: true
        },
        {
          type: "lookup_type",
          named: true
        },
        {
          type: "nested_type_identifier",
          named: true
        },
        {
          type: "object_type",
          named: true
        },
        {
          type: "parenthesized_type",
          named: true
        },
        {
          type: "predefined_type",
          named: true
        },
        {
          type: "template_literal_type",
          named: true
        },
        {
          type: "this_type",
          named: true
        },
        {
          type: "tuple_type",
          named: true
        },
        {
          type: "type_identifier",
          named: true
        },
        {
          type: "type_query",
          named: true
        },
        {
          type: "union_type",
          named: true
        }
      ]
    },
    {
      type: "statement",
      named: true,
      subtypes: [
        {
          type: "break_statement",
          named: true
        },
        {
          type: "continue_statement",
          named: true
        },
        {
          type: "debugger_statement",
          named: true
        },
        {
          type: "declaration",
          named: true
        },
        {
          type: "do_statement",
          named: true
        },
        {
          type: "empty_statement",
          named: true
        },
        {
          type: "export_statement",
          named: true
        },
        {
          type: "expression_statement",
          named: true
        },
        {
          type: "for_in_statement",
          named: true
        },
        {
          type: "for_statement",
          named: true
        },
        {
          type: "if_statement",
          named: true
        },
        {
          type: "import_statement",
          named: true
        },
        {
          type: "labeled_statement",
          named: true
        },
        {
          type: "return_statement",
          named: true
        },
        {
          type: "statement_block",
          named: true
        },
        {
          type: "switch_statement",
          named: true
        },
        {
          type: "throw_statement",
          named: true
        },
        {
          type: "try_statement",
          named: true
        },
        {
          type: "while_statement",
          named: true
        },
        {
          type: "with_statement",
          named: true
        }
      ]
    },
    {
      type: "type",
      named: true,
      subtypes: [
        {
          type: "call_expression",
          named: true
        },
        {
          type: "constructor_type",
          named: true
        },
        {
          type: "function_type",
          named: true
        },
        {
          type: "infer_type",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "primary_type",
          named: true
        },
        {
          type: "readonly_type",
          named: true
        }
      ]
    },
    {
      type: "abstract_class_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "abstract_method_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "accessibility_modifier",
      named: true,
      fields: {}
    },
    {
      type: "adding_type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "ambient_declaration",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "declaration",
            named: true
          },
          {
            type: "property_identifier",
            named: true
          },
          {
            type: "statement_block",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "array",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "array_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "assignment_pattern",
            named: true
          },
          {
            type: "pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "array_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "arrow_function",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        parameter: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "as_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "asserts",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "this",
            named: true
          },
          {
            type: "type_predicate",
            named: true
          }
        ]
      }
    },
    {
      type: "asserts_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "asserts",
            named: true
          }
        ]
      }
    },
    {
      type: "assignment_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "non_null_expression",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            },
            {
              type: "undefined",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "assignment_pattern",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pattern",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "augmented_assignment_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "non_null_expression",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "%=",
              named: false
            },
            {
              type: "&&=",
              named: false
            },
            {
              type: "&=",
              named: false
            },
            {
              type: "**=",
              named: false
            },
            {
              type: "*=",
              named: false
            },
            {
              type: "+=",
              named: false
            },
            {
              type: "-=",
              named: false
            },
            {
              type: "/=",
              named: false
            },
            {
              type: "<<=",
              named: false
            },
            {
              type: ">>=",
              named: false
            },
            {
              type: ">>>=",
              named: false
            },
            {
              type: "??=",
              named: false
            },
            {
              type: "^=",
              named: false
            },
            {
              type: "|=",
              named: false
            },
            {
              type: "||=",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "await_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "binary_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!=",
              named: false
            },
            {
              type: "!==",
              named: false
            },
            {
              type: "%",
              named: false
            },
            {
              type: "&",
              named: false
            },
            {
              type: "&&",
              named: false
            },
            {
              type: "*",
              named: false
            },
            {
              type: "**",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "/",
              named: false
            },
            {
              type: "<",
              named: false
            },
            {
              type: "<<",
              named: false
            },
            {
              type: "<=",
              named: false
            },
            {
              type: "==",
              named: false
            },
            {
              type: "===",
              named: false
            },
            {
              type: ">",
              named: false
            },
            {
              type: ">=",
              named: false
            },
            {
              type: ">>",
              named: false
            },
            {
              type: ">>>",
              named: false
            },
            {
              type: "??",
              named: false
            },
            {
              type: "^",
              named: false
            },
            {
              type: "in",
              named: false
            },
            {
              type: "instanceof",
              named: false
            },
            {
              type: "|",
              named: false
            },
            {
              type: "||",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "break_statement",
      named: true,
      fields: {
        label: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "call_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "arguments",
              named: true
            },
            {
              type: "template_string",
              named: true
            }
          ]
        },
        function: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "import",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "call_signature",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "catch_clause",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        parameter: {
          multiple: false,
          required: false,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "class",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "class_body",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "abstract_method_signature",
            named: true
          },
          {
            type: "class_static_block",
            named: true
          },
          {
            type: "index_signature",
            named: true
          },
          {
            type: "method_definition",
            named: true
          },
          {
            type: "method_signature",
            named: true
          },
          {
            type: "public_field_definition",
            named: true
          }
        ]
      }
    },
    {
      type: "class_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "class_heritage",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "extends_clause",
            named: true
          },
          {
            type: "implements_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "class_static_block",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "computed_property_name",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "conditional_type",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "constraint",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "construct_signature",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "constructor_type",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "continue_statement",
      named: true,
      fields: {
        label: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "debugger_statement",
      named: true,
      fields: {}
    },
    {
      type: "decorator",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "call_expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "member_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "default_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "do_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "else_clause",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "empty_statement",
      named: true,
      fields: {}
    },
    {
      type: "enum_assignment",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "enum_body",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: false,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "enum_assignment",
            named: true
          }
        ]
      }
    },
    {
      type: "enum_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "enum_body",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "existential_type",
      named: true,
      fields: {}
    },
    {
      type: "export_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "export_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "export_specifier",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "export_statement",
      named: true,
      fields: {
        declaration: {
          multiple: false,
          required: false,
          types: [
            {
              type: "declaration",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        source: {
          multiple: false,
          required: false,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "export_clause",
            named: true
          },
          {
            type: "expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "namespace_export",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "extends_clause",
      named: true,
      fields: {
        type_arguments: {
          multiple: true,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        },
        value: {
          multiple: true,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "extends_type_clause",
      named: true,
      fields: {
        type: {
          multiple: true,
          required: true,
          types: [
            {
              type: "generic_type",
              named: true
            },
            {
              type: "nested_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "finally_clause",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "flow_maybe_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "for_in_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        kind: {
          multiple: false,
          required: false,
          types: [
            {
              type: "const",
              named: false
            },
            {
              type: "let",
              named: false
            },
            {
              type: "var",
              named: false
            }
          ]
        },
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "non_null_expression",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            },
            {
              type: "undefined",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "in",
              named: false
            },
            {
              type: "of",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "for_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "empty_statement",
              named: true
            },
            {
              type: "expression_statement",
              named: true
            }
          ]
        },
        increment: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        },
        initializer: {
          multiple: false,
          required: true,
          types: [
            {
              type: "empty_statement",
              named: true
            },
            {
              type: "expression_statement",
              named: true
            },
            {
              type: "lexical_declaration",
              named: true
            },
            {
              type: "variable_declaration",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "formal_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "optional_parameter",
            named: true
          },
          {
            type: "required_parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "function_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_type",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "asserts",
              named: true
            },
            {
              type: "type",
              named: true
            },
            {
              type: "type_predicate",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generator_function",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generator_function_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generic_type",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "nested_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "glimmer_template",
      named: true,
      fields: {
        close_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "glimmer_closing_tag",
              named: true
            }
          ]
        },
        open_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "glimmer_opening_tag",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "identifier",
      named: true,
      fields: {}
    },
    {
      type: "if_statement",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "else_clause",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "implements_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "import",
      named: true,
      fields: {}
    },
    {
      type: "import_alias",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "nested_identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "import_attribute",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "object",
            named: true
          }
        ]
      }
    },
    {
      type: "import_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "named_imports",
            named: true
          },
          {
            type: "namespace_import",
            named: true
          }
        ]
      }
    },
    {
      type: "import_require_clause",
      named: true,
      fields: {
        source: {
          multiple: false,
          required: true,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "import_specifier",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "import_statement",
      named: true,
      fields: {
        source: {
          multiple: false,
          required: false,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "import_attribute",
            named: true
          },
          {
            type: "import_clause",
            named: true
          },
          {
            type: "import_require_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "index_signature",
      named: true,
      fields: {
        index_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        sign: {
          multiple: false,
          required: false,
          types: [
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "adding_type_annotation",
              named: true
            },
            {
              type: "omitting_type_annotation",
              named: true
            },
            {
              type: "opting_type_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mapped_type_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "index_type_query",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "infer_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          },
          {
            type: "type_identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "instantiation_expression",
      named: true,
      fields: {
        function: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "import",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "interface_body",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "call_signature",
            named: true
          },
          {
            type: "construct_signature",
            named: true
          },
          {
            type: "export_statement",
            named: true
          },
          {
            type: "index_signature",
            named: true
          },
          {
            type: "method_signature",
            named: true
          },
          {
            type: "property_signature",
            named: true
          }
        ]
      }
    },
    {
      type: "interface_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "interface_body",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "extends_type_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "internal_module",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "nested_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "intersection_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_attribute",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "jsx_element",
            named: true
          },
          {
            type: "jsx_expression",
            named: true
          },
          {
            type: "jsx_namespace_name",
            named: true
          },
          {
            type: "jsx_self_closing_element",
            named: true
          },
          {
            type: "property_identifier",
            named: true
          },
          {
            type: "string",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_closing_element",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_element",
      named: true,
      fields: {
        close_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "jsx_closing_element",
              named: true
            }
          ]
        },
        open_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "jsx_opening_element",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "html_character_reference",
            named: true
          },
          {
            type: "jsx_element",
            named: true
          },
          {
            type: "jsx_expression",
            named: true
          },
          {
            type: "jsx_self_closing_element",
            named: true
          },
          {
            type: "jsx_text",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_namespace_name",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_opening_element",
      named: true,
      fields: {
        attribute: {
          multiple: true,
          required: false,
          types: [
            {
              type: "jsx_attribute",
              named: true
            },
            {
              type: "jsx_expression",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_self_closing_element",
      named: true,
      fields: {
        attribute: {
          multiple: true,
          required: false,
          types: [
            {
              type: "jsx_attribute",
              named: true
            },
            {
              type: "jsx_expression",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_text",
      named: true,
      fields: {}
    },
    {
      type: "labeled_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        label: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "lexical_declaration",
      named: true,
      fields: {
        kind: {
          multiple: false,
          required: true,
          types: [
            {
              type: "const",
              named: false
            },
            {
              type: "let",
              named: false
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "variable_declarator",
            named: true
          }
        ]
      }
    },
    {
      type: "literal_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "false",
            named: true
          },
          {
            type: "null",
            named: true
          },
          {
            type: "number",
            named: true
          },
          {
            type: "string",
            named: true
          },
          {
            type: "true",
            named: true
          },
          {
            type: "unary_expression",
            named: true
          },
          {
            type: "undefined",
            named: true
          }
        ]
      }
    },
    {
      type: "lookup_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "mapped_type_clause",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "member_expression",
      named: true,
      fields: {
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "import",
              named: true
            }
          ]
        },
        optional_chain: {
          multiple: false,
          required: false,
          types: [
            {
              type: "optional_chain",
              named: true
            }
          ]
        },
        property: {
          multiple: false,
          required: true,
          types: [
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "meta_property",
      named: true,
      fields: {}
    },
    {
      type: "method_definition",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "method_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "asserts_annotation",
              named: true
            },
            {
              type: "type_annotation",
              named: true
            },
            {
              type: "type_predicate_annotation",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "module",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "nested_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "named_imports",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "import_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "namespace_export",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "string",
            named: true
          }
        ]
      }
    },
    {
      type: "namespace_import",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "nested_identifier",
      named: true,
      fields: {
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        },
        property: {
          multiple: false,
          required: true,
          types: [
            {
              type: "property_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "nested_type_identifier",
      named: true,
      fields: {
        module: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "nested_identifier",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "new_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "arguments",
              named: true
            }
          ]
        },
        constructor: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "non_null_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "object",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "method_definition",
            named: true
          },
          {
            type: "pair",
            named: true
          },
          {
            type: "shorthand_property_identifier",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "object_assignment_pattern",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "shorthand_property_identifier_pattern",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "object_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "object_assignment_pattern",
            named: true
          },
          {
            type: "pair_pattern",
            named: true
          },
          {
            type: "rest_pattern",
            named: true
          },
          {
            type: "shorthand_property_identifier_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "object_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "call_signature",
            named: true
          },
          {
            type: "construct_signature",
            named: true
          },
          {
            type: "export_statement",
            named: true
          },
          {
            type: "index_signature",
            named: true
          },
          {
            type: "method_signature",
            named: true
          },
          {
            type: "property_signature",
            named: true
          }
        ]
      }
    },
    {
      type: "omitting_type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "opting_type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "optional_chain",
      named: true,
      fields: {}
    },
    {
      type: "optional_parameter",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: false,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "this",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "optional_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "override_modifier",
      named: true,
      fields: {}
    },
    {
      type: "pair",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "pair_pattern",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "assignment_pattern",
              named: true
            },
            {
              type: "pattern",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "parenthesized_expression",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "parenthesized_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "predefined_type",
      named: true,
      fields: {}
    },
    {
      type: "program",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "hash_bang_line",
            named: true
          },
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "property_signature",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "public_field_definition",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "readonly_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "regex",
      named: true,
      fields: {
        flags: {
          multiple: false,
          required: false,
          types: [
            {
              type: "regex_flags",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "regex_pattern",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "required_parameter",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "rest_pattern",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: false,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "this",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "accessibility_modifier",
            named: true
          },
          {
            type: "override_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "rest_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "array_pattern",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "member_expression",
            named: true
          },
          {
            type: "non_null_expression",
            named: true
          },
          {
            type: "object_pattern",
            named: true
          },
          {
            type: "subscript_expression",
            named: true
          },
          {
            type: "undefined",
            named: true
          }
        ]
      }
    },
    {
      type: "rest_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "return_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "satisfies_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "sequence_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "spread_element",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "statement_block",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          },
          {
            type: "html_character_reference",
            named: true
          },
          {
            type: "string_fragment",
            named: true
          }
        ]
      }
    },
    {
      type: "subscript_expression",
      named: true,
      fields: {
        index: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "predefined_type",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        optional_chain: {
          multiple: false,
          required: false,
          types: [
            {
              type: "optional_chain",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_body",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "switch_case",
            named: true
          },
          {
            type: "switch_default",
            named: true
          }
        ]
      }
    },
    {
      type: "switch_case",
      named: true,
      fields: {
        body: {
          multiple: true,
          required: false,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_default",
      named: true,
      fields: {
        body: {
          multiple: true,
          required: false,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "switch_body",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "template_literal_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "string_fragment",
            named: true
          },
          {
            type: "template_type",
            named: true
          }
        ]
      }
    },
    {
      type: "template_string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          },
          {
            type: "string_fragment",
            named: true
          },
          {
            type: "template_substitution",
            named: true
          }
        ]
      }
    },
    {
      type: "template_substitution",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "template_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "infer_type",
            named: true
          },
          {
            type: "primary_type",
            named: true
          }
        ]
      }
    },
    {
      type: "ternary_expression",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "throw_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "try_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        finalizer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "finally_clause",
              named: true
            }
          ]
        },
        handler: {
          multiple: false,
          required: false,
          types: [
            {
              type: "catch_clause",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "tuple_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "optional_parameter",
            named: true
          },
          {
            type: "optional_type",
            named: true
          },
          {
            type: "required_parameter",
            named: true
          },
          {
            type: "rest_type",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_alias_declaration",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_parameter",
      named: true,
      fields: {
        constraint: {
          multiple: false,
          required: false,
          types: [
            {
              type: "constraint",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "default_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type_parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "type_predicate",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "this",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_predicate_annotation",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "type_predicate",
            named: true
          }
        ]
      }
    },
    {
      type: "type_query",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "call_expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "instantiation_expression",
            named: true
          },
          {
            type: "member_expression",
            named: true
          },
          {
            type: "subscript_expression",
            named: true
          },
          {
            type: "this",
            named: true
          }
        ]
      }
    },
    {
      type: "unary_expression",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "number",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "delete",
              named: false
            },
            {
              type: "typeof",
              named: false
            },
            {
              type: "void",
              named: false
            },
            {
              type: "~",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "union_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "update_expression",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "++",
              named: false
            },
            {
              type: "--",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "variable_declaration",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "variable_declarator",
            named: true
          }
        ]
      }
    },
    {
      type: "variable_declarator",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_annotation",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "while_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "with_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "yield_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "!",
      named: false
    },
    {
      type: "!=",
      named: false
    },
    {
      type: "!==",
      named: false
    },
    {
      type: '"',
      named: false
    },
    {
      type: "${",
      named: false
    },
    {
      type: "%",
      named: false
    },
    {
      type: "%=",
      named: false
    },
    {
      type: "&",
      named: false
    },
    {
      type: "&&",
      named: false
    },
    {
      type: "&&=",
      named: false
    },
    {
      type: "&=",
      named: false
    },
    {
      type: "'",
      named: false
    },
    {
      type: "(",
      named: false
    },
    {
      type: ")",
      named: false
    },
    {
      type: "*",
      named: false
    },
    {
      type: "**",
      named: false
    },
    {
      type: "**=",
      named: false
    },
    {
      type: "*=",
      named: false
    },
    {
      type: "+",
      named: false
    },
    {
      type: "++",
      named: false
    },
    {
      type: "+=",
      named: false
    },
    {
      type: "+?:",
      named: false
    },
    {
      type: ",",
      named: false
    },
    {
      type: "-",
      named: false
    },
    {
      type: "--",
      named: false
    },
    {
      type: "-=",
      named: false
    },
    {
      type: "-?:",
      named: false
    },
    {
      type: ".",
      named: false
    },
    {
      type: "...",
      named: false
    },
    {
      type: "/",
      named: false
    },
    {
      type: "/=",
      named: false
    },
    {
      type: "/>",
      named: false
    },
    {
      type: ":",
      named: false
    },
    {
      type: ";",
      named: false
    },
    {
      type: "<",
      named: false
    },
    {
      type: "</",
      named: false
    },
    {
      type: "<<",
      named: false
    },
    {
      type: "<<=",
      named: false
    },
    {
      type: "<=",
      named: false
    },
    {
      type: "=",
      named: false
    },
    {
      type: "==",
      named: false
    },
    {
      type: "===",
      named: false
    },
    {
      type: "=>",
      named: false
    },
    {
      type: ">",
      named: false
    },
    {
      type: ">=",
      named: false
    },
    {
      type: ">>",
      named: false
    },
    {
      type: ">>=",
      named: false
    },
    {
      type: ">>>",
      named: false
    },
    {
      type: ">>>=",
      named: false
    },
    {
      type: "?",
      named: false
    },
    {
      type: "?.",
      named: false
    },
    {
      type: "?:",
      named: false
    },
    {
      type: "??",
      named: false
    },
    {
      type: "??=",
      named: false
    },
    {
      type: "@",
      named: false
    },
    {
      type: "[",
      named: false
    },
    {
      type: "]",
      named: false
    },
    {
      type: "^",
      named: false
    },
    {
      type: "^=",
      named: false
    },
    {
      type: "`",
      named: false
    },
    {
      type: "abstract",
      named: false
    },
    {
      type: "accessor",
      named: false
    },
    {
      type: "any",
      named: false
    },
    {
      type: "as",
      named: false
    },
    {
      type: "asserts",
      named: false
    },
    {
      type: "async",
      named: false
    },
    {
      type: "await",
      named: false
    },
    {
      type: "boolean",
      named: false
    },
    {
      type: "break",
      named: false
    },
    {
      type: "case",
      named: false
    },
    {
      type: "catch",
      named: false
    },
    {
      type: "class",
      named: false
    },
    {
      type: "comment",
      named: true
    },
    {
      type: "const",
      named: false
    },
    {
      type: "continue",
      named: false
    },
    {
      type: "debugger",
      named: false
    },
    {
      type: "declare",
      named: false
    },
    {
      type: "default",
      named: false
    },
    {
      type: "delete",
      named: false
    },
    {
      type: "do",
      named: false
    },
    {
      type: "else",
      named: false
    },
    {
      type: "enum",
      named: false
    },
    {
      type: "escape_sequence",
      named: true
    },
    {
      type: "export",
      named: false
    },
    {
      type: "extends",
      named: false
    },
    {
      type: "false",
      named: true
    },
    {
      type: "finally",
      named: false
    },
    {
      type: "for",
      named: false
    },
    {
      type: "from",
      named: false
    },
    {
      type: "function",
      named: false
    },
    {
      type: "get",
      named: false
    },
    {
      type: "glimmer_closing_tag",
      named: true
    },
    {
      type: "glimmer_opening_tag",
      named: true
    },
    {
      type: "global",
      named: false
    },
    {
      type: "hash_bang_line",
      named: true
    },
    {
      type: "html_character_reference",
      named: true
    },
    {
      type: "html_comment",
      named: true
    },
    {
      type: "if",
      named: false
    },
    {
      type: "implements",
      named: false
    },
    {
      type: "import",
      named: false
    },
    {
      type: "in",
      named: false
    },
    {
      type: "infer",
      named: false
    },
    {
      type: "instanceof",
      named: false
    },
    {
      type: "interface",
      named: false
    },
    {
      type: "is",
      named: false
    },
    {
      type: "keyof",
      named: false
    },
    {
      type: "let",
      named: false
    },
    {
      type: "module",
      named: false
    },
    {
      type: "namespace",
      named: false
    },
    {
      type: "never",
      named: false
    },
    {
      type: "new",
      named: false
    },
    {
      type: "null",
      named: true
    },
    {
      type: "number",
      named: true
    },
    {
      type: "number",
      named: false
    },
    {
      type: "object",
      named: false
    },
    {
      type: "of",
      named: false
    },
    {
      type: "override",
      named: false
    },
    {
      type: "private",
      named: false
    },
    {
      type: "private_property_identifier",
      named: true
    },
    {
      type: "property_identifier",
      named: true
    },
    {
      type: "protected",
      named: false
    },
    {
      type: "public",
      named: false
    },
    {
      type: "readonly",
      named: false
    },
    {
      type: "regex_flags",
      named: true
    },
    {
      type: "regex_pattern",
      named: true
    },
    {
      type: "require",
      named: false
    },
    {
      type: "return",
      named: false
    },
    {
      type: "satisfies",
      named: false
    },
    {
      type: "set",
      named: false
    },
    {
      type: "shorthand_property_identifier",
      named: true
    },
    {
      type: "shorthand_property_identifier_pattern",
      named: true
    },
    {
      type: "statement_identifier",
      named: true
    },
    {
      type: "static",
      named: false
    },
    {
      type: "string",
      named: false
    },
    {
      type: "string_fragment",
      named: true
    },
    {
      type: "super",
      named: true
    },
    {
      type: "switch",
      named: false
    },
    {
      type: "symbol",
      named: false
    },
    {
      type: "target",
      named: false
    },
    {
      type: "this",
      named: true
    },
    {
      type: "this_type",
      named: true
    },
    {
      type: "throw",
      named: false
    },
    {
      type: "true",
      named: true
    },
    {
      type: "try",
      named: false
    },
    {
      type: "type",
      named: false
    },
    {
      type: "type_identifier",
      named: true
    },
    {
      type: "typeof",
      named: false
    },
    {
      type: "undefined",
      named: true
    },
    {
      type: "unique symbol",
      named: false
    },
    {
      type: "unknown",
      named: false
    },
    {
      type: "using",
      named: false
    },
    {
      type: "var",
      named: false
    },
    {
      type: "void",
      named: false
    },
    {
      type: "while",
      named: false
    },
    {
      type: "with",
      named: false
    },
    {
      type: "yield",
      named: false
    },
    {
      type: "{",
      named: false
    },
    {
      type: "{|",
      named: false
    },
    {
      type: "|",
      named: false
    },
    {
      type: "|=",
      named: false
    },
    {
      type: "||",
      named: false
    },
    {
      type: "||=",
      named: false
    },
    {
      type: "|}",
      named: false
    },
    {
      type: "}",
      named: false
    },
    {
      type: "~",
      named: false
    }
  ];
});

// node_modules/tree-sitter-typescript/bindings/node/index.js
var require_node = __commonJS((exports, module) => {
  var __dirname = "/root/code/HashPilot/node_modules/tree-sitter-typescript/bindings/node";
  var root2 = __require("path").join(__dirname, "..", "..");
  module.exports = require_node_gyp_build2()(root2);
  try {
    module.exports.typescript.nodeTypeInfo = require_node_types();
    module.exports.tsx.nodeTypeInfo = require_node_types2();
  } catch (_) {}
});

// node_modules/tree-sitter-python/src/node-types.json
var require_node_types3 = __commonJS((exports, module) => {
  module.exports = [
    {
      type: "_compound_statement",
      named: true,
      subtypes: [
        {
          type: "class_definition",
          named: true
        },
        {
          type: "decorated_definition",
          named: true
        },
        {
          type: "for_statement",
          named: true
        },
        {
          type: "function_definition",
          named: true
        },
        {
          type: "if_statement",
          named: true
        },
        {
          type: "match_statement",
          named: true
        },
        {
          type: "try_statement",
          named: true
        },
        {
          type: "while_statement",
          named: true
        },
        {
          type: "with_statement",
          named: true
        }
      ]
    },
    {
      type: "_simple_statement",
      named: true,
      subtypes: [
        {
          type: "assert_statement",
          named: true
        },
        {
          type: "break_statement",
          named: true
        },
        {
          type: "continue_statement",
          named: true
        },
        {
          type: "delete_statement",
          named: true
        },
        {
          type: "exec_statement",
          named: true
        },
        {
          type: "expression_statement",
          named: true
        },
        {
          type: "future_import_statement",
          named: true
        },
        {
          type: "global_statement",
          named: true
        },
        {
          type: "import_from_statement",
          named: true
        },
        {
          type: "import_statement",
          named: true
        },
        {
          type: "nonlocal_statement",
          named: true
        },
        {
          type: "pass_statement",
          named: true
        },
        {
          type: "print_statement",
          named: true
        },
        {
          type: "raise_statement",
          named: true
        },
        {
          type: "return_statement",
          named: true
        },
        {
          type: "type_alias_statement",
          named: true
        }
      ]
    },
    {
      type: "expression",
      named: true,
      subtypes: [
        {
          type: "as_pattern",
          named: true
        },
        {
          type: "boolean_operator",
          named: true
        },
        {
          type: "comparison_operator",
          named: true
        },
        {
          type: "conditional_expression",
          named: true
        },
        {
          type: "lambda",
          named: true
        },
        {
          type: "named_expression",
          named: true
        },
        {
          type: "not_operator",
          named: true
        },
        {
          type: "primary_expression",
          named: true
        }
      ]
    },
    {
      type: "parameter",
      named: true,
      subtypes: [
        {
          type: "default_parameter",
          named: true
        },
        {
          type: "dictionary_splat_pattern",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "keyword_separator",
          named: true
        },
        {
          type: "list_splat_pattern",
          named: true
        },
        {
          type: "positional_separator",
          named: true
        },
        {
          type: "tuple_pattern",
          named: true
        },
        {
          type: "typed_default_parameter",
          named: true
        },
        {
          type: "typed_parameter",
          named: true
        }
      ]
    },
    {
      type: "pattern",
      named: true,
      subtypes: [
        {
          type: "attribute",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "list_pattern",
          named: true
        },
        {
          type: "list_splat_pattern",
          named: true
        },
        {
          type: "subscript",
          named: true
        },
        {
          type: "tuple_pattern",
          named: true
        }
      ]
    },
    {
      type: "primary_expression",
      named: true,
      subtypes: [
        {
          type: "attribute",
          named: true
        },
        {
          type: "await",
          named: true
        },
        {
          type: "binary_operator",
          named: true
        },
        {
          type: "call",
          named: true
        },
        {
          type: "concatenated_string",
          named: true
        },
        {
          type: "dictionary",
          named: true
        },
        {
          type: "dictionary_comprehension",
          named: true
        },
        {
          type: "ellipsis",
          named: true
        },
        {
          type: "false",
          named: true
        },
        {
          type: "float",
          named: true
        },
        {
          type: "generator_expression",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "integer",
          named: true
        },
        {
          type: "list",
          named: true
        },
        {
          type: "list_comprehension",
          named: true
        },
        {
          type: "list_splat",
          named: true
        },
        {
          type: "none",
          named: true
        },
        {
          type: "parenthesized_expression",
          named: true
        },
        {
          type: "set",
          named: true
        },
        {
          type: "set_comprehension",
          named: true
        },
        {
          type: "string",
          named: true
        },
        {
          type: "subscript",
          named: true
        },
        {
          type: "true",
          named: true
        },
        {
          type: "tuple",
          named: true
        },
        {
          type: "unary_operator",
          named: true
        }
      ]
    },
    {
      type: "aliased_import",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "dotted_name",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "argument_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "dictionary_splat",
            named: true
          },
          {
            type: "expression",
            named: true
          },
          {
            type: "keyword_argument",
            named: true
          },
          {
            type: "list_splat",
            named: true
          },
          {
            type: "parenthesized_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "as_pattern",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "as_pattern_target",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "case_pattern",
            named: true
          },
          {
            type: "expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "assert_statement",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "assignment",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: false,
          types: [
            {
              type: "assignment",
              named: true
            },
            {
              type: "augmented_assignment",
              named: true
            },
            {
              type: "expression",
              named: true
            },
            {
              type: "expression_list",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            },
            {
              type: "yield",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "attribute",
      named: true,
      fields: {
        attribute: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "augmented_assignment",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "%=",
              named: false
            },
            {
              type: "&=",
              named: false
            },
            {
              type: "**=",
              named: false
            },
            {
              type: "*=",
              named: false
            },
            {
              type: "+=",
              named: false
            },
            {
              type: "-=",
              named: false
            },
            {
              type: "//=",
              named: false
            },
            {
              type: "/=",
              named: false
            },
            {
              type: "<<=",
              named: false
            },
            {
              type: ">>=",
              named: false
            },
            {
              type: "@=",
              named: false
            },
            {
              type: "^=",
              named: false
            },
            {
              type: "|=",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "assignment",
              named: true
            },
            {
              type: "augmented_assignment",
              named: true
            },
            {
              type: "expression",
              named: true
            },
            {
              type: "expression_list",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            },
            {
              type: "yield",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "await",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "primary_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "binary_operator",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "%",
              named: false
            },
            {
              type: "&",
              named: false
            },
            {
              type: "*",
              named: false
            },
            {
              type: "**",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "/",
              named: false
            },
            {
              type: "//",
              named: false
            },
            {
              type: "<<",
              named: false
            },
            {
              type: ">>",
              named: false
            },
            {
              type: "@",
              named: false
            },
            {
              type: "^",
              named: false
            },
            {
              type: "|",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "block",
      named: true,
      fields: {
        alternative: {
          multiple: true,
          required: false,
          types: [
            {
              type: "case_clause",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_compound_statement",
            named: true
          },
          {
            type: "_simple_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "boolean_operator",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "and",
              named: false
            },
            {
              type: "or",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "break_statement",
      named: true,
      fields: {}
    },
    {
      type: "call",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "argument_list",
              named: true
            },
            {
              type: "generator_expression",
              named: true
            }
          ]
        },
        function: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "case_clause",
      named: true,
      fields: {
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        guard: {
          multiple: false,
          required: false,
          types: [
            {
              type: "if_clause",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "case_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "case_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "as_pattern",
            named: true
          },
          {
            type: "class_pattern",
            named: true
          },
          {
            type: "complex_pattern",
            named: true
          },
          {
            type: "concatenated_string",
            named: true
          },
          {
            type: "dict_pattern",
            named: true
          },
          {
            type: "dotted_name",
            named: true
          },
          {
            type: "false",
            named: true
          },
          {
            type: "float",
            named: true
          },
          {
            type: "integer",
            named: true
          },
          {
            type: "keyword_pattern",
            named: true
          },
          {
            type: "list_pattern",
            named: true
          },
          {
            type: "none",
            named: true
          },
          {
            type: "splat_pattern",
            named: true
          },
          {
            type: "string",
            named: true
          },
          {
            type: "true",
            named: true
          },
          {
            type: "tuple_pattern",
            named: true
          },
          {
            type: "union_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "chevron",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "class_definition",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        superclasses: {
          multiple: false,
          required: false,
          types: [
            {
              type: "argument_list",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameter",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "class_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "case_pattern",
            named: true
          },
          {
            type: "dotted_name",
            named: true
          }
        ]
      }
    },
    {
      type: "comparison_operator",
      named: true,
      fields: {
        operators: {
          multiple: true,
          required: true,
          types: [
            {
              type: "!=",
              named: false
            },
            {
              type: "<",
              named: false
            },
            {
              type: "<=",
              named: false
            },
            {
              type: "<>",
              named: false
            },
            {
              type: "==",
              named: false
            },
            {
              type: ">",
              named: false
            },
            {
              type: ">=",
              named: false
            },
            {
              type: "in",
              named: false
            },
            {
              type: "is",
              named: false
            },
            {
              type: "is not",
              named: false
            },
            {
              type: "not in",
              named: false
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "primary_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "complex_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "float",
            named: true
          },
          {
            type: "integer",
            named: true
          }
        ]
      }
    },
    {
      type: "concatenated_string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "string",
            named: true
          }
        ]
      }
    },
    {
      type: "conditional_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "constrained_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "continue_statement",
      named: true,
      fields: {}
    },
    {
      type: "decorated_definition",
      named: true,
      fields: {
        definition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_definition",
              named: true
            },
            {
              type: "function_definition",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "decorator",
            named: true
          }
        ]
      }
    },
    {
      type: "decorator",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "default_parameter",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "tuple_pattern",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "delete_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "expression_list",
            named: true
          }
        ]
      }
    },
    {
      type: "dict_pattern",
      named: true,
      fields: {
        key: {
          multiple: true,
          required: false,
          types: [
            {
              type: "-",
              named: false
            },
            {
              type: "_",
              named: false
            },
            {
              type: "class_pattern",
              named: true
            },
            {
              type: "complex_pattern",
              named: true
            },
            {
              type: "concatenated_string",
              named: true
            },
            {
              type: "dict_pattern",
              named: true
            },
            {
              type: "dotted_name",
              named: true
            },
            {
              type: "false",
              named: true
            },
            {
              type: "float",
              named: true
            },
            {
              type: "integer",
              named: true
            },
            {
              type: "list_pattern",
              named: true
            },
            {
              type: "none",
              named: true
            },
            {
              type: "splat_pattern",
              named: true
            },
            {
              type: "string",
              named: true
            },
            {
              type: "true",
              named: true
            },
            {
              type: "tuple_pattern",
              named: true
            },
            {
              type: "union_pattern",
              named: true
            }
          ]
        },
        value: {
          multiple: true,
          required: false,
          types: [
            {
              type: "case_pattern",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "splat_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "dictionary",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "dictionary_splat",
            named: true
          },
          {
            type: "pair",
            named: true
          }
        ]
      }
    },
    {
      type: "dictionary_comprehension",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pair",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "for_in_clause",
            named: true
          },
          {
            type: "if_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "dictionary_splat",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "dictionary_splat_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "attribute",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "subscript",
            named: true
          }
        ]
      }
    },
    {
      type: "dotted_name",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "elif_clause",
      named: true,
      fields: {
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "else_clause",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "except_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "block",
            named: true
          },
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "except_group_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "block",
            named: true
          },
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "exec_statement",
      named: true,
      fields: {
        code: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_statement",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "assignment",
            named: true
          },
          {
            type: "augmented_assignment",
            named: true
          },
          {
            type: "expression",
            named: true
          },
          {
            type: "yield",
            named: true
          }
        ]
      }
    },
    {
      type: "finally_clause",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "block",
            named: true
          }
        ]
      }
    },
    {
      type: "for_in_clause",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            }
          ]
        },
        right: {
          multiple: true,
          required: true,
          types: [
            {
              type: ",",
              named: false
            },
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "for_statement",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "else_clause",
              named: true
            }
          ]
        },
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pattern",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "expression_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "format_expression",
      named: true,
      fields: {
        expression: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "expression_list",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            },
            {
              type: "yield",
              named: true
            }
          ]
        },
        format_specifier: {
          multiple: false,
          required: false,
          types: [
            {
              type: "format_specifier",
              named: true
            }
          ]
        },
        type_conversion: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_conversion",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "format_specifier",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "format_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "function_definition",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameter",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "future_import_statement",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: true,
          types: [
            {
              type: "aliased_import",
              named: true
            },
            {
              type: "dotted_name",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generator_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "for_in_clause",
            named: true
          },
          {
            type: "if_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "generic_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "type_parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "global_statement",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "if_clause",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "if_statement",
      named: true,
      fields: {
        alternative: {
          multiple: true,
          required: false,
          types: [
            {
              type: "elif_clause",
              named: true
            },
            {
              type: "else_clause",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "import_from_statement",
      named: true,
      fields: {
        module_name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "dotted_name",
              named: true
            },
            {
              type: "relative_import",
              named: true
            }
          ]
        },
        name: {
          multiple: true,
          required: false,
          types: [
            {
              type: "aliased_import",
              named: true
            },
            {
              type: "dotted_name",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "wildcard_import",
            named: true
          }
        ]
      }
    },
    {
      type: "import_prefix",
      named: true,
      fields: {}
    },
    {
      type: "import_statement",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: true,
          types: [
            {
              type: "aliased_import",
              named: true
            },
            {
              type: "dotted_name",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "interpolation",
      named: true,
      fields: {
        expression: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "expression_list",
              named: true
            },
            {
              type: "pattern_list",
              named: true
            },
            {
              type: "yield",
              named: true
            }
          ]
        },
        format_specifier: {
          multiple: false,
          required: false,
          types: [
            {
              type: "format_specifier",
              named: true
            }
          ]
        },
        type_conversion: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_conversion",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "keyword_argument",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "keyword_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "class_pattern",
            named: true
          },
          {
            type: "complex_pattern",
            named: true
          },
          {
            type: "concatenated_string",
            named: true
          },
          {
            type: "dict_pattern",
            named: true
          },
          {
            type: "dotted_name",
            named: true
          },
          {
            type: "false",
            named: true
          },
          {
            type: "float",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "integer",
            named: true
          },
          {
            type: "list_pattern",
            named: true
          },
          {
            type: "none",
            named: true
          },
          {
            type: "splat_pattern",
            named: true
          },
          {
            type: "string",
            named: true
          },
          {
            type: "true",
            named: true
          },
          {
            type: "tuple_pattern",
            named: true
          },
          {
            type: "union_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "keyword_separator",
      named: true,
      fields: {}
    },
    {
      type: "lambda",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "lambda_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "lambda_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "list_splat",
            named: true
          },
          {
            type: "parenthesized_list_splat",
            named: true
          },
          {
            type: "yield",
            named: true
          }
        ]
      }
    },
    {
      type: "list_comprehension",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "for_in_clause",
            named: true
          },
          {
            type: "if_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "list_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "case_pattern",
            named: true
          },
          {
            type: "pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "list_splat",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "attribute",
            named: true
          },
          {
            type: "expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "subscript",
            named: true
          }
        ]
      }
    },
    {
      type: "list_splat_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "attribute",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "subscript",
            named: true
          }
        ]
      }
    },
    {
      type: "match_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        subject: {
          multiple: true,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "member_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "module",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_compound_statement",
            named: true
          },
          {
            type: "_simple_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "named_expression",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "nonlocal_statement",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "not_operator",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "pair",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "parenthesized_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "list_splat",
            named: true
          },
          {
            type: "parenthesized_expression",
            named: true
          },
          {
            type: "yield",
            named: true
          }
        ]
      }
    },
    {
      type: "parenthesized_list_splat",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "list_splat",
            named: true
          },
          {
            type: "parenthesized_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "pass_statement",
      named: true,
      fields: {}
    },
    {
      type: "pattern_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "positional_separator",
      named: true,
      fields: {}
    },
    {
      type: "print_statement",
      named: true,
      fields: {
        argument: {
          multiple: true,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "chevron",
            named: true
          }
        ]
      }
    },
    {
      type: "raise_statement",
      named: true,
      fields: {
        cause: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "expression_list",
            named: true
          }
        ]
      }
    },
    {
      type: "relative_import",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "dotted_name",
            named: true
          },
          {
            type: "import_prefix",
            named: true
          }
        ]
      }
    },
    {
      type: "return_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "expression_list",
            named: true
          }
        ]
      }
    },
    {
      type: "set",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "list_splat",
            named: true
          },
          {
            type: "parenthesized_list_splat",
            named: true
          },
          {
            type: "yield",
            named: true
          }
        ]
      }
    },
    {
      type: "set_comprehension",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "for_in_clause",
            named: true
          },
          {
            type: "if_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "slice",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "splat_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "splat_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "interpolation",
            named: true
          },
          {
            type: "string_content",
            named: true
          },
          {
            type: "string_end",
            named: true
          },
          {
            type: "string_start",
            named: true
          }
        ]
      }
    },
    {
      type: "string_content",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_interpolation",
            named: true
          },
          {
            type: "escape_sequence",
            named: true
          }
        ]
      }
    },
    {
      type: "subscript",
      named: true,
      fields: {
        subscript: {
          multiple: true,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "slice",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "try_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "else_clause",
            named: true
          },
          {
            type: "except_clause",
            named: true
          },
          {
            type: "except_group_clause",
            named: true
          },
          {
            type: "finally_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "tuple",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "list_splat",
            named: true
          },
          {
            type: "parenthesized_list_splat",
            named: true
          },
          {
            type: "yield",
            named: true
          }
        ]
      }
    },
    {
      type: "tuple_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "case_pattern",
            named: true
          },
          {
            type: "pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "constrained_type",
            named: true
          },
          {
            type: "expression",
            named: true
          },
          {
            type: "generic_type",
            named: true
          },
          {
            type: "member_type",
            named: true
          },
          {
            type: "splat_type",
            named: true
          },
          {
            type: "union_type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_alias_statement",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_parameter",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "typed_default_parameter",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "typed_parameter",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "dictionary_splat_pattern",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "list_splat_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "unary_operator",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "primary_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "~",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "union_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "class_pattern",
            named: true
          },
          {
            type: "complex_pattern",
            named: true
          },
          {
            type: "concatenated_string",
            named: true
          },
          {
            type: "dict_pattern",
            named: true
          },
          {
            type: "dotted_name",
            named: true
          },
          {
            type: "false",
            named: true
          },
          {
            type: "float",
            named: true
          },
          {
            type: "integer",
            named: true
          },
          {
            type: "list_pattern",
            named: true
          },
          {
            type: "none",
            named: true
          },
          {
            type: "splat_pattern",
            named: true
          },
          {
            type: "string",
            named: true
          },
          {
            type: "true",
            named: true
          },
          {
            type: "tuple_pattern",
            named: true
          },
          {
            type: "union_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "union_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type",
            named: true
          }
        ]
      }
    },
    {
      type: "while_statement",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "else_clause",
              named: true
            }
          ]
        },
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "wildcard_import",
      named: true,
      fields: {}
    },
    {
      type: "with_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "with_item",
            named: true
          }
        ]
      }
    },
    {
      type: "with_item",
      named: true,
      fields: {
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "with_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "with_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "yield",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "expression_list",
            named: true
          }
        ]
      }
    },
    {
      type: "!=",
      named: false
    },
    {
      type: "%",
      named: false
    },
    {
      type: "%=",
      named: false
    },
    {
      type: "&",
      named: false
    },
    {
      type: "&=",
      named: false
    },
    {
      type: "(",
      named: false
    },
    {
      type: ")",
      named: false
    },
    {
      type: "*",
      named: false
    },
    {
      type: "**",
      named: false
    },
    {
      type: "**=",
      named: false
    },
    {
      type: "*=",
      named: false
    },
    {
      type: "+",
      named: false
    },
    {
      type: "+=",
      named: false
    },
    {
      type: ",",
      named: false
    },
    {
      type: "-",
      named: false
    },
    {
      type: "-=",
      named: false
    },
    {
      type: "->",
      named: false
    },
    {
      type: ".",
      named: false
    },
    {
      type: "/",
      named: false
    },
    {
      type: "//",
      named: false
    },
    {
      type: "//=",
      named: false
    },
    {
      type: "/=",
      named: false
    },
    {
      type: ":",
      named: false
    },
    {
      type: ":=",
      named: false
    },
    {
      type: ";",
      named: false
    },
    {
      type: "<",
      named: false
    },
    {
      type: "<<",
      named: false
    },
    {
      type: "<<=",
      named: false
    },
    {
      type: "<=",
      named: false
    },
    {
      type: "<>",
      named: false
    },
    {
      type: "=",
      named: false
    },
    {
      type: "==",
      named: false
    },
    {
      type: ">",
      named: false
    },
    {
      type: ">=",
      named: false
    },
    {
      type: ">>",
      named: false
    },
    {
      type: ">>=",
      named: false
    },
    {
      type: "@",
      named: false
    },
    {
      type: "@=",
      named: false
    },
    {
      type: "[",
      named: false
    },
    {
      type: "]",
      named: false
    },
    {
      type: "^",
      named: false
    },
    {
      type: "^=",
      named: false
    },
    {
      type: "_",
      named: false
    },
    {
      type: "__future__",
      named: false
    },
    {
      type: "and",
      named: false
    },
    {
      type: "as",
      named: false
    },
    {
      type: "assert",
      named: false
    },
    {
      type: "async",
      named: false
    },
    {
      type: "await",
      named: false
    },
    {
      type: "break",
      named: false
    },
    {
      type: "case",
      named: false
    },
    {
      type: "class",
      named: false
    },
    {
      type: "comment",
      named: true
    },
    {
      type: "continue",
      named: false
    },
    {
      type: "def",
      named: false
    },
    {
      type: "del",
      named: false
    },
    {
      type: "elif",
      named: false
    },
    {
      type: "ellipsis",
      named: true
    },
    {
      type: "else",
      named: false
    },
    {
      type: "escape_interpolation",
      named: true
    },
    {
      type: "escape_sequence",
      named: true
    },
    {
      type: "except",
      named: false
    },
    {
      type: "except*",
      named: false
    },
    {
      type: "exec",
      named: false
    },
    {
      type: "false",
      named: true
    },
    {
      type: "finally",
      named: false
    },
    {
      type: "float",
      named: true
    },
    {
      type: "for",
      named: false
    },
    {
      type: "from",
      named: false
    },
    {
      type: "global",
      named: false
    },
    {
      type: "identifier",
      named: true
    },
    {
      type: "if",
      named: false
    },
    {
      type: "import",
      named: false
    },
    {
      type: "in",
      named: false
    },
    {
      type: "integer",
      named: true
    },
    {
      type: "is",
      named: false
    },
    {
      type: "is not",
      named: false
    },
    {
      type: "lambda",
      named: false
    },
    {
      type: "line_continuation",
      named: true
    },
    {
      type: "match",
      named: false
    },
    {
      type: "none",
      named: true
    },
    {
      type: "nonlocal",
      named: false
    },
    {
      type: "not",
      named: false
    },
    {
      type: "not in",
      named: false
    },
    {
      type: "or",
      named: false
    },
    {
      type: "pass",
      named: false
    },
    {
      type: "print",
      named: false
    },
    {
      type: "raise",
      named: false
    },
    {
      type: "return",
      named: false
    },
    {
      type: "string_end",
      named: true
    },
    {
      type: "string_start",
      named: true
    },
    {
      type: "true",
      named: true
    },
    {
      type: "try",
      named: false
    },
    {
      type: "type",
      named: false
    },
    {
      type: "type_conversion",
      named: true
    },
    {
      type: "while",
      named: false
    },
    {
      type: "with",
      named: false
    },
    {
      type: "yield",
      named: false
    },
    {
      type: "{",
      named: false
    },
    {
      type: "|",
      named: false
    },
    {
      type: "|=",
      named: false
    },
    {
      type: "}",
      named: false
    },
    {
      type: "~",
      named: false
    }
  ];
});

// node_modules/tree-sitter-python/bindings/node/index.js
var require_node2 = __commonJS((exports, module) => {
  var __dirname = "/root/code/HashPilot/node_modules/tree-sitter-python/bindings/node";
  var root2 = __require("path").join(__dirname, "..", "..");
  module.exports = require_node_gyp_build2()(root2);
  try {
    module.exports.nodeTypeInfo = require_node_types3();
  } catch (_) {}
});

// node_modules/tree-sitter-javascript/src/node-types.json
var require_node_types4 = __commonJS((exports, module) => {
  module.exports = [
    {
      type: "declaration",
      named: true,
      subtypes: [
        {
          type: "class_declaration",
          named: true
        },
        {
          type: "function_declaration",
          named: true
        },
        {
          type: "generator_function_declaration",
          named: true
        },
        {
          type: "lexical_declaration",
          named: true
        },
        {
          type: "variable_declaration",
          named: true
        }
      ]
    },
    {
      type: "expression",
      named: true,
      subtypes: [
        {
          type: "assignment_expression",
          named: true
        },
        {
          type: "augmented_assignment_expression",
          named: true
        },
        {
          type: "await_expression",
          named: true
        },
        {
          type: "binary_expression",
          named: true
        },
        {
          type: "glimmer_template",
          named: true
        },
        {
          type: "jsx_element",
          named: true
        },
        {
          type: "jsx_self_closing_element",
          named: true
        },
        {
          type: "new_expression",
          named: true
        },
        {
          type: "primary_expression",
          named: true
        },
        {
          type: "ternary_expression",
          named: true
        },
        {
          type: "unary_expression",
          named: true
        },
        {
          type: "update_expression",
          named: true
        },
        {
          type: "yield_expression",
          named: true
        }
      ]
    },
    {
      type: "pattern",
      named: true,
      subtypes: [
        {
          type: "array_pattern",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "object_pattern",
          named: true
        },
        {
          type: "rest_pattern",
          named: true
        },
        {
          type: "subscript_expression",
          named: true
        },
        {
          type: "undefined",
          named: true
        }
      ]
    },
    {
      type: "primary_expression",
      named: true,
      subtypes: [
        {
          type: "array",
          named: true
        },
        {
          type: "arrow_function",
          named: true
        },
        {
          type: "call_expression",
          named: true
        },
        {
          type: "class",
          named: true
        },
        {
          type: "false",
          named: true
        },
        {
          type: "function_expression",
          named: true
        },
        {
          type: "generator_function",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "member_expression",
          named: true
        },
        {
          type: "meta_property",
          named: true
        },
        {
          type: "null",
          named: true
        },
        {
          type: "number",
          named: true
        },
        {
          type: "object",
          named: true
        },
        {
          type: "parenthesized_expression",
          named: true
        },
        {
          type: "regex",
          named: true
        },
        {
          type: "string",
          named: true
        },
        {
          type: "subscript_expression",
          named: true
        },
        {
          type: "super",
          named: true
        },
        {
          type: "template_string",
          named: true
        },
        {
          type: "this",
          named: true
        },
        {
          type: "true",
          named: true
        },
        {
          type: "undefined",
          named: true
        }
      ]
    },
    {
      type: "statement",
      named: true,
      subtypes: [
        {
          type: "break_statement",
          named: true
        },
        {
          type: "continue_statement",
          named: true
        },
        {
          type: "debugger_statement",
          named: true
        },
        {
          type: "declaration",
          named: true
        },
        {
          type: "do_statement",
          named: true
        },
        {
          type: "empty_statement",
          named: true
        },
        {
          type: "export_statement",
          named: true
        },
        {
          type: "expression_statement",
          named: true
        },
        {
          type: "for_in_statement",
          named: true
        },
        {
          type: "for_statement",
          named: true
        },
        {
          type: "if_statement",
          named: true
        },
        {
          type: "import_statement",
          named: true
        },
        {
          type: "labeled_statement",
          named: true
        },
        {
          type: "return_statement",
          named: true
        },
        {
          type: "statement_block",
          named: true
        },
        {
          type: "switch_statement",
          named: true
        },
        {
          type: "throw_statement",
          named: true
        },
        {
          type: "try_statement",
          named: true
        },
        {
          type: "while_statement",
          named: true
        },
        {
          type: "with_statement",
          named: true
        }
      ]
    },
    {
      type: "arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "array",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "array_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "assignment_pattern",
            named: true
          },
          {
            type: "pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "arrow_function",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        parameter: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "assignment_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            },
            {
              type: "undefined",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "assignment_pattern",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "pattern",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "augmented_assignment_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "%=",
              named: false
            },
            {
              type: "&&=",
              named: false
            },
            {
              type: "&=",
              named: false
            },
            {
              type: "**=",
              named: false
            },
            {
              type: "*=",
              named: false
            },
            {
              type: "+=",
              named: false
            },
            {
              type: "-=",
              named: false
            },
            {
              type: "/=",
              named: false
            },
            {
              type: "<<=",
              named: false
            },
            {
              type: ">>=",
              named: false
            },
            {
              type: ">>>=",
              named: false
            },
            {
              type: "??=",
              named: false
            },
            {
              type: "^=",
              named: false
            },
            {
              type: "|=",
              named: false
            },
            {
              type: "||=",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "await_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "binary_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!=",
              named: false
            },
            {
              type: "!==",
              named: false
            },
            {
              type: "%",
              named: false
            },
            {
              type: "&",
              named: false
            },
            {
              type: "&&",
              named: false
            },
            {
              type: "*",
              named: false
            },
            {
              type: "**",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "/",
              named: false
            },
            {
              type: "<",
              named: false
            },
            {
              type: "<<",
              named: false
            },
            {
              type: "<=",
              named: false
            },
            {
              type: "==",
              named: false
            },
            {
              type: "===",
              named: false
            },
            {
              type: ">",
              named: false
            },
            {
              type: ">=",
              named: false
            },
            {
              type: ">>",
              named: false
            },
            {
              type: ">>>",
              named: false
            },
            {
              type: "??",
              named: false
            },
            {
              type: "^",
              named: false
            },
            {
              type: "in",
              named: false
            },
            {
              type: "instanceof",
              named: false
            },
            {
              type: "|",
              named: false
            },
            {
              type: "||",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "break_statement",
      named: true,
      fields: {
        label: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "call_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "arguments",
              named: true
            },
            {
              type: "template_string",
              named: true
            }
          ]
        },
        function: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "import",
              named: true
            }
          ]
        },
        optional_chain: {
          multiple: false,
          required: false,
          types: [
            {
              type: "optional_chain",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "catch_clause",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        parameter: {
          multiple: false,
          required: false,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "class",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "class_body",
      named: true,
      fields: {
        member: {
          multiple: true,
          required: false,
          types: [
            {
              type: "class_static_block",
              named: true
            },
            {
              type: "field_definition",
              named: true
            },
            {
              type: "method_definition",
              named: true
            }
          ]
        },
        template: {
          multiple: true,
          required: false,
          types: [
            {
              type: "glimmer_template",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "class_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "class_body",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "class_heritage",
            named: true
          }
        ]
      }
    },
    {
      type: "class_heritage",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "class_static_block",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "computed_property_name",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "continue_statement",
      named: true,
      fields: {
        label: {
          multiple: false,
          required: false,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "debugger_statement",
      named: true,
      fields: {}
    },
    {
      type: "decorator",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "call_expression",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "member_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "do_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "else_clause",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "empty_statement",
      named: true,
      fields: {}
    },
    {
      type: "export_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "export_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "export_specifier",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "export_statement",
      named: true,
      fields: {
        declaration: {
          multiple: false,
          required: false,
          types: [
            {
              type: "declaration",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        source: {
          multiple: false,
          required: false,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "export_clause",
            named: true
          },
          {
            type: "namespace_export",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "field_definition",
      named: true,
      fields: {
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        property: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "finally_clause",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "for_in_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        kind: {
          multiple: false,
          required: false,
          types: [
            {
              type: "const",
              named: false
            },
            {
              type: "let",
              named: false
            },
            {
              type: "var",
              named: false
            }
          ]
        },
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "member_expression",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "subscript_expression",
              named: true
            },
            {
              type: "undefined",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "in",
              named: false
            },
            {
              type: "of",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "for_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "empty_statement",
              named: true
            },
            {
              type: "expression_statement",
              named: true
            }
          ]
        },
        increment: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        },
        initializer: {
          multiple: false,
          required: true,
          types: [
            {
              type: "empty_statement",
              named: true
            },
            {
              type: "expression_statement",
              named: true
            },
            {
              type: "lexical_declaration",
              named: true
            },
            {
              type: "variable_declaration",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "formal_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "assignment_pattern",
            named: true
          },
          {
            type: "pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "function_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generator_function",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generator_function_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "glimmer_template",
      named: true,
      fields: {
        close_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "glimmer_closing_tag",
              named: true
            }
          ]
        },
        open_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "glimmer_opening_tag",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "if_statement",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "else_clause",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "import",
      named: true,
      fields: {}
    },
    {
      type: "import_attribute",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "object",
            named: true
          }
        ]
      }
    },
    {
      type: "import_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "named_imports",
            named: true
          },
          {
            type: "namespace_import",
            named: true
          }
        ]
      }
    },
    {
      type: "import_specifier",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "import_statement",
      named: true,
      fields: {
        source: {
          multiple: false,
          required: true,
          types: [
            {
              type: "string",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "import_attribute",
            named: true
          },
          {
            type: "import_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_attribute",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "jsx_element",
            named: true
          },
          {
            type: "jsx_expression",
            named: true
          },
          {
            type: "jsx_namespace_name",
            named: true
          },
          {
            type: "jsx_self_closing_element",
            named: true
          },
          {
            type: "property_identifier",
            named: true
          },
          {
            type: "string",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_closing_element",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_element",
      named: true,
      fields: {
        close_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "jsx_closing_element",
              named: true
            }
          ]
        },
        open_tag: {
          multiple: false,
          required: true,
          types: [
            {
              type: "jsx_opening_element",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "html_character_reference",
            named: true
          },
          {
            type: "jsx_element",
            named: true
          },
          {
            type: "jsx_expression",
            named: true
          },
          {
            type: "jsx_self_closing_element",
            named: true
          },
          {
            type: "jsx_text",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_namespace_name",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "jsx_opening_element",
      named: true,
      fields: {
        attribute: {
          multiple: true,
          required: false,
          types: [
            {
              type: "jsx_attribute",
              named: true
            },
            {
              type: "jsx_expression",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_self_closing_element",
      named: true,
      fields: {
        attribute: {
          multiple: true,
          required: false,
          types: [
            {
              type: "jsx_attribute",
              named: true
            },
            {
              type: "jsx_expression",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "jsx_namespace_name",
              named: true
            },
            {
              type: "member_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "jsx_text",
      named: true,
      fields: {}
    },
    {
      type: "labeled_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        label: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "lexical_declaration",
      named: true,
      fields: {
        kind: {
          multiple: false,
          required: true,
          types: [
            {
              type: "const",
              named: false
            },
            {
              type: "let",
              named: false
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "variable_declarator",
            named: true
          }
        ]
      }
    },
    {
      type: "member_expression",
      named: true,
      fields: {
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "import",
              named: true
            }
          ]
        },
        optional_chain: {
          multiple: false,
          required: false,
          types: [
            {
              type: "optional_chain",
              named: true
            }
          ]
        },
        property: {
          multiple: false,
          required: true,
          types: [
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "meta_property",
      named: true,
      fields: {}
    },
    {
      type: "method_definition",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        decorator: {
          multiple: true,
          required: false,
          types: [
            {
              type: "decorator",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "formal_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "named_imports",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "import_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "namespace_export",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "string",
            named: true
          }
        ]
      }
    },
    {
      type: "namespace_import",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "new_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "arguments",
              named: true
            }
          ]
        },
        constructor: {
          multiple: false,
          required: true,
          types: [
            {
              type: "new_expression",
              named: true
            },
            {
              type: "primary_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "object",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "method_definition",
            named: true
          },
          {
            type: "pair",
            named: true
          },
          {
            type: "shorthand_property_identifier",
            named: true
          },
          {
            type: "spread_element",
            named: true
          }
        ]
      }
    },
    {
      type: "object_assignment_pattern",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            },
            {
              type: "shorthand_property_identifier_pattern",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "object_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "object_assignment_pattern",
            named: true
          },
          {
            type: "pair_pattern",
            named: true
          },
          {
            type: "rest_pattern",
            named: true
          },
          {
            type: "shorthand_property_identifier_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "pair",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "pair_pattern",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "computed_property_name",
              named: true
            },
            {
              type: "number",
              named: true
            },
            {
              type: "private_property_identifier",
              named: true
            },
            {
              type: "property_identifier",
              named: true
            },
            {
              type: "string",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "assignment_pattern",
              named: true
            },
            {
              type: "pattern",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "parenthesized_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "program",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "hash_bang_line",
            named: true
          },
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "regex",
      named: true,
      fields: {
        flags: {
          multiple: false,
          required: false,
          types: [
            {
              type: "regex_flags",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "regex_pattern",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "rest_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "array_pattern",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "member_expression",
            named: true
          },
          {
            type: "object_pattern",
            named: true
          },
          {
            type: "subscript_expression",
            named: true
          },
          {
            type: "undefined",
            named: true
          }
        ]
      }
    },
    {
      type: "return_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "sequence_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "spread_element",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "statement_block",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "statement",
            named: true
          }
        ]
      }
    },
    {
      type: "string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          },
          {
            type: "html_character_reference",
            named: true
          },
          {
            type: "string_fragment",
            named: true
          }
        ]
      }
    },
    {
      type: "subscript_expression",
      named: true,
      fields: {
        index: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        },
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        optional_chain: {
          multiple: false,
          required: false,
          types: [
            {
              type: "optional_chain",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_body",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "switch_case",
            named: true
          },
          {
            type: "switch_default",
            named: true
          }
        ]
      }
    },
    {
      type: "switch_case",
      named: true,
      fields: {
        body: {
          multiple: true,
          required: false,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            },
            {
              type: "sequence_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_default",
      named: true,
      fields: {
        body: {
          multiple: true,
          required: false,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "switch_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "switch_body",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "template_string",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          },
          {
            type: "string_fragment",
            named: true
          },
          {
            type: "template_substitution",
            named: true
          }
        ]
      }
    },
    {
      type: "template_substitution",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "ternary_expression",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "throw_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "expression",
            named: true
          },
          {
            type: "sequence_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "try_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement_block",
              named: true
            }
          ]
        },
        finalizer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "finally_clause",
              named: true
            }
          ]
        },
        handler: {
          multiple: false,
          required: false,
          types: [
            {
              type: "catch_clause",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "unary_expression",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "delete",
              named: false
            },
            {
              type: "typeof",
              named: false
            },
            {
              type: "void",
              named: false
            },
            {
              type: "~",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "update_expression",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "++",
              named: false
            },
            {
              type: "--",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "variable_declaration",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "variable_declarator",
            named: true
          }
        ]
      }
    },
    {
      type: "variable_declarator",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_pattern",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "object_pattern",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "while_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "with_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "statement",
              named: true
            }
          ]
        },
        object: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parenthesized_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "yield_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression",
            named: true
          }
        ]
      }
    },
    {
      type: "!",
      named: false
    },
    {
      type: "!=",
      named: false
    },
    {
      type: "!==",
      named: false
    },
    {
      type: '"',
      named: false
    },
    {
      type: "${",
      named: false
    },
    {
      type: "%",
      named: false
    },
    {
      type: "%=",
      named: false
    },
    {
      type: "&",
      named: false
    },
    {
      type: "&&",
      named: false
    },
    {
      type: "&&=",
      named: false
    },
    {
      type: "&=",
      named: false
    },
    {
      type: "'",
      named: false
    },
    {
      type: "(",
      named: false
    },
    {
      type: ")",
      named: false
    },
    {
      type: "*",
      named: false
    },
    {
      type: "**",
      named: false
    },
    {
      type: "**=",
      named: false
    },
    {
      type: "*=",
      named: false
    },
    {
      type: "+",
      named: false
    },
    {
      type: "++",
      named: false
    },
    {
      type: "+=",
      named: false
    },
    {
      type: ",",
      named: false
    },
    {
      type: "-",
      named: false
    },
    {
      type: "--",
      named: false
    },
    {
      type: "-=",
      named: false
    },
    {
      type: ".",
      named: false
    },
    {
      type: "...",
      named: false
    },
    {
      type: "/",
      named: false
    },
    {
      type: "/=",
      named: false
    },
    {
      type: "/>",
      named: false
    },
    {
      type: ":",
      named: false
    },
    {
      type: ";",
      named: false
    },
    {
      type: "<",
      named: false
    },
    {
      type: "</",
      named: false
    },
    {
      type: "<<",
      named: false
    },
    {
      type: "<<=",
      named: false
    },
    {
      type: "<=",
      named: false
    },
    {
      type: "=",
      named: false
    },
    {
      type: "==",
      named: false
    },
    {
      type: "===",
      named: false
    },
    {
      type: "=>",
      named: false
    },
    {
      type: ">",
      named: false
    },
    {
      type: ">=",
      named: false
    },
    {
      type: ">>",
      named: false
    },
    {
      type: ">>=",
      named: false
    },
    {
      type: ">>>",
      named: false
    },
    {
      type: ">>>=",
      named: false
    },
    {
      type: "?",
      named: false
    },
    {
      type: "??",
      named: false
    },
    {
      type: "??=",
      named: false
    },
    {
      type: "@",
      named: false
    },
    {
      type: "[",
      named: false
    },
    {
      type: "]",
      named: false
    },
    {
      type: "^",
      named: false
    },
    {
      type: "^=",
      named: false
    },
    {
      type: "`",
      named: false
    },
    {
      type: "as",
      named: false
    },
    {
      type: "async",
      named: false
    },
    {
      type: "await",
      named: false
    },
    {
      type: "break",
      named: false
    },
    {
      type: "case",
      named: false
    },
    {
      type: "catch",
      named: false
    },
    {
      type: "class",
      named: false
    },
    {
      type: "comment",
      named: true
    },
    {
      type: "const",
      named: false
    },
    {
      type: "continue",
      named: false
    },
    {
      type: "debugger",
      named: false
    },
    {
      type: "default",
      named: false
    },
    {
      type: "delete",
      named: false
    },
    {
      type: "do",
      named: false
    },
    {
      type: "else",
      named: false
    },
    {
      type: "escape_sequence",
      named: true
    },
    {
      type: "export",
      named: false
    },
    {
      type: "extends",
      named: false
    },
    {
      type: "false",
      named: true
    },
    {
      type: "finally",
      named: false
    },
    {
      type: "for",
      named: false
    },
    {
      type: "from",
      named: false
    },
    {
      type: "function",
      named: false
    },
    {
      type: "get",
      named: false
    },
    {
      type: "glimmer_closing_tag",
      named: true
    },
    {
      type: "glimmer_opening_tag",
      named: true
    },
    {
      type: "hash_bang_line",
      named: true
    },
    {
      type: "html_character_reference",
      named: true
    },
    {
      type: "html_comment",
      named: true
    },
    {
      type: "identifier",
      named: true
    },
    {
      type: "if",
      named: false
    },
    {
      type: "import",
      named: false
    },
    {
      type: "in",
      named: false
    },
    {
      type: "instanceof",
      named: false
    },
    {
      type: "let",
      named: false
    },
    {
      type: "new",
      named: false
    },
    {
      type: "null",
      named: true
    },
    {
      type: "number",
      named: true
    },
    {
      type: "of",
      named: false
    },
    {
      type: "optional_chain",
      named: true
    },
    {
      type: "private_property_identifier",
      named: true
    },
    {
      type: "property_identifier",
      named: true
    },
    {
      type: "regex_flags",
      named: true
    },
    {
      type: "regex_pattern",
      named: true
    },
    {
      type: "return",
      named: false
    },
    {
      type: "set",
      named: false
    },
    {
      type: "shorthand_property_identifier",
      named: true
    },
    {
      type: "shorthand_property_identifier_pattern",
      named: true
    },
    {
      type: "statement_identifier",
      named: true
    },
    {
      type: "static",
      named: false
    },
    {
      type: "static get",
      named: false
    },
    {
      type: "string_fragment",
      named: true
    },
    {
      type: "super",
      named: true
    },
    {
      type: "switch",
      named: false
    },
    {
      type: "target",
      named: false
    },
    {
      type: "this",
      named: true
    },
    {
      type: "throw",
      named: false
    },
    {
      type: "true",
      named: true
    },
    {
      type: "try",
      named: false
    },
    {
      type: "typeof",
      named: false
    },
    {
      type: "undefined",
      named: true
    },
    {
      type: "var",
      named: false
    },
    {
      type: "void",
      named: false
    },
    {
      type: "while",
      named: false
    },
    {
      type: "with",
      named: false
    },
    {
      type: "yield",
      named: false
    },
    {
      type: "{",
      named: false
    },
    {
      type: "|",
      named: false
    },
    {
      type: "|=",
      named: false
    },
    {
      type: "||",
      named: false
    },
    {
      type: "||=",
      named: false
    },
    {
      type: "}",
      named: false
    },
    {
      type: "~",
      named: false
    }
  ];
});

// node_modules/tree-sitter-javascript/bindings/node/index.js
var require_node3 = __commonJS((exports, module) => {
  var __dirname = "/root/code/HashPilot/node_modules/tree-sitter-javascript/bindings/node";
  var root2 = __require("path").join(__dirname, "..", "..");
  module.exports = require_node_gyp_build2()(root2);
  try {
    module.exports.nodeTypeInfo = require_node_types4();
  } catch (_) {}
});

// node_modules/tree-sitter-go/src/node-types.json
var require_node_types5 = __commonJS((exports, module) => {
  module.exports = [
    {
      type: "_expression",
      named: true,
      subtypes: [
        {
          type: "binary_expression",
          named: true
        },
        {
          type: "call_expression",
          named: true
        },
        {
          type: "composite_literal",
          named: true
        },
        {
          type: "false",
          named: true
        },
        {
          type: "float_literal",
          named: true
        },
        {
          type: "func_literal",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "imaginary_literal",
          named: true
        },
        {
          type: "index_expression",
          named: true
        },
        {
          type: "int_literal",
          named: true
        },
        {
          type: "interpreted_string_literal",
          named: true
        },
        {
          type: "iota",
          named: true
        },
        {
          type: "nil",
          named: true
        },
        {
          type: "parenthesized_expression",
          named: true
        },
        {
          type: "raw_string_literal",
          named: true
        },
        {
          type: "rune_literal",
          named: true
        },
        {
          type: "selector_expression",
          named: true
        },
        {
          type: "slice_expression",
          named: true
        },
        {
          type: "true",
          named: true
        },
        {
          type: "type_assertion_expression",
          named: true
        },
        {
          type: "type_conversion_expression",
          named: true
        },
        {
          type: "type_instantiation_expression",
          named: true
        },
        {
          type: "unary_expression",
          named: true
        }
      ]
    },
    {
      type: "_simple_statement",
      named: true,
      subtypes: [
        {
          type: "assignment_statement",
          named: true
        },
        {
          type: "dec_statement",
          named: true
        },
        {
          type: "expression_statement",
          named: true
        },
        {
          type: "inc_statement",
          named: true
        },
        {
          type: "send_statement",
          named: true
        },
        {
          type: "short_var_declaration",
          named: true
        }
      ]
    },
    {
      type: "_simple_type",
      named: true,
      subtypes: [
        {
          type: "array_type",
          named: true
        },
        {
          type: "channel_type",
          named: true
        },
        {
          type: "function_type",
          named: true
        },
        {
          type: "generic_type",
          named: true
        },
        {
          type: "interface_type",
          named: true
        },
        {
          type: "map_type",
          named: true
        },
        {
          type: "negated_type",
          named: true
        },
        {
          type: "pointer_type",
          named: true
        },
        {
          type: "qualified_type",
          named: true
        },
        {
          type: "slice_type",
          named: true
        },
        {
          type: "struct_type",
          named: true
        },
        {
          type: "type_identifier",
          named: true
        }
      ]
    },
    {
      type: "_statement",
      named: true,
      subtypes: [
        {
          type: "_simple_statement",
          named: true
        },
        {
          type: "block",
          named: true
        },
        {
          type: "break_statement",
          named: true
        },
        {
          type: "const_declaration",
          named: true
        },
        {
          type: "continue_statement",
          named: true
        },
        {
          type: "defer_statement",
          named: true
        },
        {
          type: "empty_statement",
          named: true
        },
        {
          type: "expression_switch_statement",
          named: true
        },
        {
          type: "fallthrough_statement",
          named: true
        },
        {
          type: "for_statement",
          named: true
        },
        {
          type: "go_statement",
          named: true
        },
        {
          type: "goto_statement",
          named: true
        },
        {
          type: "if_statement",
          named: true
        },
        {
          type: "labeled_statement",
          named: true
        },
        {
          type: "return_statement",
          named: true
        },
        {
          type: "select_statement",
          named: true
        },
        {
          type: "type_declaration",
          named: true
        },
        {
          type: "type_switch_statement",
          named: true
        },
        {
          type: "var_declaration",
          named: true
        }
      ]
    },
    {
      type: "_type",
      named: true,
      subtypes: [
        {
          type: "_simple_type",
          named: true
        },
        {
          type: "parenthesized_type",
          named: true
        }
      ]
    },
    {
      type: "argument_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "_type",
            named: true
          },
          {
            type: "variadic_argument",
            named: true
          }
        ]
      }
    },
    {
      type: "array_type",
      named: true,
      fields: {
        element: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        length: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "assignment_statement",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "%=",
              named: false
            },
            {
              type: "&=",
              named: false
            },
            {
              type: "&^=",
              named: false
            },
            {
              type: "*=",
              named: false
            },
            {
              type: "+=",
              named: false
            },
            {
              type: "-=",
              named: false
            },
            {
              type: "/=",
              named: false
            },
            {
              type: "<<=",
              named: false
            },
            {
              type: "=",
              named: false
            },
            {
              type: ">>=",
              named: false
            },
            {
              type: "^=",
              named: false
            },
            {
              type: "|=",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "binary_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!=",
              named: false
            },
            {
              type: "%",
              named: false
            },
            {
              type: "&",
              named: false
            },
            {
              type: "&&",
              named: false
            },
            {
              type: "&^",
              named: false
            },
            {
              type: "*",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "/",
              named: false
            },
            {
              type: "<",
              named: false
            },
            {
              type: "<<",
              named: false
            },
            {
              type: "<=",
              named: false
            },
            {
              type: "==",
              named: false
            },
            {
              type: ">",
              named: false
            },
            {
              type: ">=",
              named: false
            },
            {
              type: ">>",
              named: false
            },
            {
              type: "^",
              named: false
            },
            {
              type: "|",
              named: false
            },
            {
              type: "||",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "block",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "break_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "label_name",
            named: true
          }
        ]
      }
    },
    {
      type: "call_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "argument_list",
              named: true
            }
          ]
        },
        function: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "channel_type",
      named: true,
      fields: {
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "communication_case",
      named: true,
      fields: {
        communication: {
          multiple: false,
          required: true,
          types: [
            {
              type: "receive_statement",
              named: true
            },
            {
              type: "send_statement",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "composite_literal",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "literal_value",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_type",
              named: true
            },
            {
              type: "generic_type",
              named: true
            },
            {
              type: "implicit_length_array_type",
              named: true
            },
            {
              type: "map_type",
              named: true
            },
            {
              type: "qualified_type",
              named: true
            },
            {
              type: "slice_type",
              named: true
            },
            {
              type: "struct_type",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "const_declaration",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "const_spec",
            named: true
          }
        ]
      }
    },
    {
      type: "const_spec",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: true,
          types: [
            {
              type: ",",
              named: false
            },
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "continue_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "label_name",
            named: true
          }
        ]
      }
    },
    {
      type: "dec_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "default_case",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "defer_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "dot",
      named: true,
      fields: {}
    },
    {
      type: "empty_statement",
      named: true,
      fields: {}
    },
    {
      type: "expression_case",
      named: true,
      fields: {
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_switch_statement",
      named: true,
      fields: {
        initializer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_statement",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "default_case",
            named: true
          },
          {
            type: "expression_case",
            named: true
          }
        ]
      }
    },
    {
      type: "fallthrough_statement",
      named: true,
      fields: {}
    },
    {
      type: "field_declaration",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: false,
          types: [
            {
              type: "field_identifier",
              named: true
            }
          ]
        },
        tag: {
          multiple: false,
          required: false,
          types: [
            {
              type: "interpreted_string_literal",
              named: true
            },
            {
              type: "raw_string_literal",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            },
            {
              type: "generic_type",
              named: true
            },
            {
              type: "qualified_type",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "field_declaration_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "field_declaration",
            named: true
          }
        ]
      }
    },
    {
      type: "for_clause",
      named: true,
      fields: {
        condition: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        initializer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_statement",
              named: true
            }
          ]
        },
        update: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "for_statement",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "for_clause",
            named: true
          },
          {
            type: "range_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "func_literal",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameter_list",
              named: true
            }
          ]
        },
        result: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_type",
              named: true
            },
            {
              type: "parameter_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameter_list",
              named: true
            }
          ]
        },
        result: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_type",
              named: true
            },
            {
              type: "parameter_list",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameter_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "function_type",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameter_list",
              named: true
            }
          ]
        },
        result: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_type",
              named: true
            },
            {
              type: "parameter_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generic_type",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "negated_type",
              named: true
            },
            {
              type: "qualified_type",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "go_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "goto_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "label_name",
            named: true
          }
        ]
      }
    },
    {
      type: "if_statement",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "block",
              named: true
            },
            {
              type: "if_statement",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        initializer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_statement",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "implicit_length_array_type",
      named: true,
      fields: {
        element: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "import_declaration",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "import_spec",
            named: true
          },
          {
            type: "import_spec_list",
            named: true
          }
        ]
      }
    },
    {
      type: "import_spec",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "blank_identifier",
              named: true
            },
            {
              type: "dot",
              named: true
            },
            {
              type: "package_identifier",
              named: true
            }
          ]
        },
        path: {
          multiple: false,
          required: true,
          types: [
            {
              type: "interpreted_string_literal",
              named: true
            },
            {
              type: "raw_string_literal",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "import_spec_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "import_spec",
            named: true
          }
        ]
      }
    },
    {
      type: "inc_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "index_expression",
      named: true,
      fields: {
        index: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        operand: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "interface_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "method_elem",
            named: true
          },
          {
            type: "type_elem",
            named: true
          }
        ]
      }
    },
    {
      type: "interpreted_string_literal",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          }
        ]
      }
    },
    {
      type: "keyed_element",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "literal_element",
            named: true
          }
        ]
      }
    },
    {
      type: "labeled_statement",
      named: true,
      fields: {
        label: {
          multiple: false,
          required: true,
          types: [
            {
              type: "label_name",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "literal_element",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "literal_value",
            named: true
          }
        ]
      }
    },
    {
      type: "literal_value",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "keyed_element",
            named: true
          },
          {
            type: "literal_element",
            named: true
          }
        ]
      }
    },
    {
      type: "map_type",
      named: true,
      fields: {
        key: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "method_declaration",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameter_list",
              named: true
            }
          ]
        },
        receiver: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameter_list",
              named: true
            }
          ]
        },
        result: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_type",
              named: true
            },
            {
              type: "parameter_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "method_elem",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_identifier",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameter_list",
              named: true
            }
          ]
        },
        result: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_type",
              named: true
            },
            {
              type: "parameter_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "negated_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "package_clause",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "package_identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "parameter_declaration",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "parameter_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "parameter_declaration",
            named: true
          },
          {
            type: "variadic_parameter_declaration",
            named: true
          }
        ]
      }
    },
    {
      type: "parenthesized_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "parenthesized_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "pointer_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "qualified_type",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        package: {
          multiple: false,
          required: true,
          types: [
            {
              type: "package_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "range_clause",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "receive_statement",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "return_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "expression_list",
            named: true
          }
        ]
      }
    },
    {
      type: "select_statement",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "communication_case",
            named: true
          },
          {
            type: "default_case",
            named: true
          }
        ]
      }
    },
    {
      type: "selector_expression",
      named: true,
      fields: {
        field: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_identifier",
              named: true
            }
          ]
        },
        operand: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "send_statement",
      named: true,
      fields: {
        channel: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "short_var_declaration",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "slice_expression",
      named: true,
      fields: {
        capacity: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        end: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        operand: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        start: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "slice_type",
      named: true,
      fields: {
        element: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "source_file",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_statement",
            named: true
          },
          {
            type: "function_declaration",
            named: true
          },
          {
            type: "import_declaration",
            named: true
          },
          {
            type: "method_declaration",
            named: true
          },
          {
            type: "package_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "struct_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "field_declaration_list",
            named: true
          }
        ]
      }
    },
    {
      type: "type_alias",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type_elem",
            named: true
          }
        ]
      }
    },
    {
      type: "type_assertion_expression",
      named: true,
      fields: {
        operand: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_case",
      named: true,
      fields: {
        type: {
          multiple: true,
          required: true,
          types: [
            {
              type: ",",
              named: false
            },
            {
              type: "_type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "type_constraint",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_conversion_expression",
      named: true,
      fields: {
        operand: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_declaration",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "type_alias",
            named: true
          },
          {
            type: "type_spec",
            named: true
          }
        ]
      }
    },
    {
      type: "type_elem",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_instantiation_expression",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_parameter_declaration",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_constraint",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_parameter_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "type_parameter_declaration",
            named: true
          }
        ]
      }
    },
    {
      type: "type_spec",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameter_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_switch_statement",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        },
        initializer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_simple_statement",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "default_case",
            named: true
          },
          {
            type: "type_case",
            named: true
          }
        ]
      }
    },
    {
      type: "unary_expression",
      named: true,
      fields: {
        operand: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!",
              named: false
            },
            {
              type: "&",
              named: false
            },
            {
              type: "*",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "<-",
              named: false
            },
            {
              type: "^",
              named: false
            }
          ]
        }
      }
    },
    {
      type: "var_declaration",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "var_spec",
            named: true
          },
          {
            type: "var_spec_list",
            named: true
          }
        ]
      }
    },
    {
      type: "var_spec",
      named: true,
      fields: {
        name: {
          multiple: true,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "expression_list",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "var_spec_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "var_spec",
            named: true
          }
        ]
      }
    },
    {
      type: "variadic_argument",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "variadic_parameter_declaration",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "\x00",
      named: false
    },
    {
      type: `
`,
      named: false
    },
    {
      type: "!",
      named: false
    },
    {
      type: "!=",
      named: false
    },
    {
      type: '"',
      named: false
    },
    {
      type: "%",
      named: false
    },
    {
      type: "%=",
      named: false
    },
    {
      type: "&",
      named: false
    },
    {
      type: "&&",
      named: false
    },
    {
      type: "&=",
      named: false
    },
    {
      type: "&^",
      named: false
    },
    {
      type: "&^=",
      named: false
    },
    {
      type: "(",
      named: false
    },
    {
      type: ")",
      named: false
    },
    {
      type: "*",
      named: false
    },
    {
      type: "*=",
      named: false
    },
    {
      type: "+",
      named: false
    },
    {
      type: "++",
      named: false
    },
    {
      type: "+=",
      named: false
    },
    {
      type: ",",
      named: false
    },
    {
      type: "-",
      named: false
    },
    {
      type: "--",
      named: false
    },
    {
      type: "-=",
      named: false
    },
    {
      type: ".",
      named: false
    },
    {
      type: "...",
      named: false
    },
    {
      type: "/",
      named: false
    },
    {
      type: "/=",
      named: false
    },
    {
      type: ":",
      named: false
    },
    {
      type: ":=",
      named: false
    },
    {
      type: ";",
      named: false
    },
    {
      type: "<",
      named: false
    },
    {
      type: "<-",
      named: false
    },
    {
      type: "<<",
      named: false
    },
    {
      type: "<<=",
      named: false
    },
    {
      type: "<=",
      named: false
    },
    {
      type: "=",
      named: false
    },
    {
      type: "==",
      named: false
    },
    {
      type: ">",
      named: false
    },
    {
      type: ">=",
      named: false
    },
    {
      type: ">>",
      named: false
    },
    {
      type: ">>=",
      named: false
    },
    {
      type: "[",
      named: false
    },
    {
      type: "]",
      named: false
    },
    {
      type: "^",
      named: false
    },
    {
      type: "^=",
      named: false
    },
    {
      type: "blank_identifier",
      named: true
    },
    {
      type: "break",
      named: false
    },
    {
      type: "case",
      named: false
    },
    {
      type: "chan",
      named: false
    },
    {
      type: "comment",
      named: true
    },
    {
      type: "const",
      named: false
    },
    {
      type: "continue",
      named: false
    },
    {
      type: "default",
      named: false
    },
    {
      type: "defer",
      named: false
    },
    {
      type: "else",
      named: false
    },
    {
      type: "escape_sequence",
      named: true
    },
    {
      type: "fallthrough",
      named: false
    },
    {
      type: "false",
      named: true
    },
    {
      type: "field_identifier",
      named: true
    },
    {
      type: "float_literal",
      named: true
    },
    {
      type: "for",
      named: false
    },
    {
      type: "func",
      named: false
    },
    {
      type: "go",
      named: false
    },
    {
      type: "goto",
      named: false
    },
    {
      type: "identifier",
      named: true
    },
    {
      type: "if",
      named: false
    },
    {
      type: "imaginary_literal",
      named: true
    },
    {
      type: "import",
      named: false
    },
    {
      type: "int_literal",
      named: true
    },
    {
      type: "interface",
      named: false
    },
    {
      type: "iota",
      named: true
    },
    {
      type: "label_name",
      named: true
    },
    {
      type: "map",
      named: false
    },
    {
      type: "nil",
      named: true
    },
    {
      type: "package",
      named: false
    },
    {
      type: "package_identifier",
      named: true
    },
    {
      type: "range",
      named: false
    },
    {
      type: "raw_string_literal",
      named: true
    },
    {
      type: "return",
      named: false
    },
    {
      type: "rune_literal",
      named: true
    },
    {
      type: "select",
      named: false
    },
    {
      type: "struct",
      named: false
    },
    {
      type: "switch",
      named: false
    },
    {
      type: "true",
      named: true
    },
    {
      type: "type",
      named: false
    },
    {
      type: "type_identifier",
      named: true
    },
    {
      type: "var",
      named: false
    },
    {
      type: "{",
      named: false
    },
    {
      type: "|",
      named: false
    },
    {
      type: "|=",
      named: false
    },
    {
      type: "||",
      named: false
    },
    {
      type: "}",
      named: false
    },
    {
      type: "~",
      named: false
    }
  ];
});

// node_modules/tree-sitter-go/bindings/node/index.js
var require_node4 = __commonJS((exports, module) => {
  var __dirname = "/root/code/HashPilot/node_modules/tree-sitter-go/bindings/node";
  var root2 = __require("path").join(__dirname, "..", "..");
  module.exports = require_node_gyp_build2()(root2);
  try {
    module.exports.nodeTypeInfo = require_node_types5();
  } catch (_) {}
});

// node_modules/tree-sitter-rust/src/node-types.json
var require_node_types6 = __commonJS((exports, module) => {
  module.exports = [
    {
      type: "_declaration_statement",
      named: true,
      subtypes: [
        {
          type: "associated_type",
          named: true
        },
        {
          type: "attribute_item",
          named: true
        },
        {
          type: "const_item",
          named: true
        },
        {
          type: "empty_statement",
          named: true
        },
        {
          type: "enum_item",
          named: true
        },
        {
          type: "extern_crate_declaration",
          named: true
        },
        {
          type: "foreign_mod_item",
          named: true
        },
        {
          type: "function_item",
          named: true
        },
        {
          type: "function_signature_item",
          named: true
        },
        {
          type: "impl_item",
          named: true
        },
        {
          type: "inner_attribute_item",
          named: true
        },
        {
          type: "let_declaration",
          named: true
        },
        {
          type: "macro_definition",
          named: true
        },
        {
          type: "macro_invocation",
          named: true
        },
        {
          type: "mod_item",
          named: true
        },
        {
          type: "static_item",
          named: true
        },
        {
          type: "struct_item",
          named: true
        },
        {
          type: "trait_item",
          named: true
        },
        {
          type: "type_item",
          named: true
        },
        {
          type: "union_item",
          named: true
        },
        {
          type: "use_declaration",
          named: true
        }
      ]
    },
    {
      type: "_expression",
      named: true,
      subtypes: [
        {
          type: "_literal",
          named: true
        },
        {
          type: "array_expression",
          named: true
        },
        {
          type: "assignment_expression",
          named: true
        },
        {
          type: "async_block",
          named: true
        },
        {
          type: "await_expression",
          named: true
        },
        {
          type: "binary_expression",
          named: true
        },
        {
          type: "block",
          named: true
        },
        {
          type: "break_expression",
          named: true
        },
        {
          type: "call_expression",
          named: true
        },
        {
          type: "closure_expression",
          named: true
        },
        {
          type: "compound_assignment_expr",
          named: true
        },
        {
          type: "const_block",
          named: true
        },
        {
          type: "continue_expression",
          named: true
        },
        {
          type: "field_expression",
          named: true
        },
        {
          type: "for_expression",
          named: true
        },
        {
          type: "gen_block",
          named: true
        },
        {
          type: "generic_function",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "if_expression",
          named: true
        },
        {
          type: "index_expression",
          named: true
        },
        {
          type: "loop_expression",
          named: true
        },
        {
          type: "macro_invocation",
          named: true
        },
        {
          type: "match_expression",
          named: true
        },
        {
          type: "metavariable",
          named: true
        },
        {
          type: "parenthesized_expression",
          named: true
        },
        {
          type: "range_expression",
          named: true
        },
        {
          type: "reference_expression",
          named: true
        },
        {
          type: "return_expression",
          named: true
        },
        {
          type: "scoped_identifier",
          named: true
        },
        {
          type: "self",
          named: true
        },
        {
          type: "struct_expression",
          named: true
        },
        {
          type: "try_block",
          named: true
        },
        {
          type: "try_expression",
          named: true
        },
        {
          type: "tuple_expression",
          named: true
        },
        {
          type: "type_cast_expression",
          named: true
        },
        {
          type: "unary_expression",
          named: true
        },
        {
          type: "unit_expression",
          named: true
        },
        {
          type: "unsafe_block",
          named: true
        },
        {
          type: "while_expression",
          named: true
        },
        {
          type: "yield_expression",
          named: true
        }
      ]
    },
    {
      type: "_literal",
      named: true,
      subtypes: [
        {
          type: "boolean_literal",
          named: true
        },
        {
          type: "char_literal",
          named: true
        },
        {
          type: "float_literal",
          named: true
        },
        {
          type: "integer_literal",
          named: true
        },
        {
          type: "raw_string_literal",
          named: true
        },
        {
          type: "string_literal",
          named: true
        }
      ]
    },
    {
      type: "_literal_pattern",
      named: true,
      subtypes: [
        {
          type: "boolean_literal",
          named: true
        },
        {
          type: "char_literal",
          named: true
        },
        {
          type: "float_literal",
          named: true
        },
        {
          type: "integer_literal",
          named: true
        },
        {
          type: "negative_literal",
          named: true
        },
        {
          type: "raw_string_literal",
          named: true
        },
        {
          type: "string_literal",
          named: true
        }
      ]
    },
    {
      type: "_pattern",
      named: true,
      subtypes: [
        {
          type: "_",
          named: false
        },
        {
          type: "_literal_pattern",
          named: true
        },
        {
          type: "captured_pattern",
          named: true
        },
        {
          type: "const_block",
          named: true
        },
        {
          type: "generic_pattern",
          named: true
        },
        {
          type: "identifier",
          named: true
        },
        {
          type: "macro_invocation",
          named: true
        },
        {
          type: "mut_pattern",
          named: true
        },
        {
          type: "or_pattern",
          named: true
        },
        {
          type: "range_pattern",
          named: true
        },
        {
          type: "ref_pattern",
          named: true
        },
        {
          type: "reference_pattern",
          named: true
        },
        {
          type: "remaining_field_pattern",
          named: true
        },
        {
          type: "scoped_identifier",
          named: true
        },
        {
          type: "slice_pattern",
          named: true
        },
        {
          type: "struct_pattern",
          named: true
        },
        {
          type: "tuple_pattern",
          named: true
        },
        {
          type: "tuple_struct_pattern",
          named: true
        }
      ]
    },
    {
      type: "_type",
      named: true,
      subtypes: [
        {
          type: "abstract_type",
          named: true
        },
        {
          type: "array_type",
          named: true
        },
        {
          type: "bounded_type",
          named: true
        },
        {
          type: "dynamic_type",
          named: true
        },
        {
          type: "function_type",
          named: true
        },
        {
          type: "generic_type",
          named: true
        },
        {
          type: "macro_invocation",
          named: true
        },
        {
          type: "metavariable",
          named: true
        },
        {
          type: "never_type",
          named: true
        },
        {
          type: "pointer_type",
          named: true
        },
        {
          type: "primitive_type",
          named: true
        },
        {
          type: "reference_type",
          named: true
        },
        {
          type: "removed_trait_bound",
          named: true
        },
        {
          type: "scoped_type_identifier",
          named: true
        },
        {
          type: "tuple_type",
          named: true
        },
        {
          type: "type_identifier",
          named: true
        },
        {
          type: "unit_type",
          named: true
        }
      ]
    },
    {
      type: "abstract_type",
      named: true,
      fields: {
        trait: {
          multiple: false,
          required: true,
          types: [
            {
              type: "bounded_type",
              named: true
            },
            {
              type: "function_type",
              named: true
            },
            {
              type: "generic_type",
              named: true
            },
            {
              type: "removed_trait_bound",
              named: true
            },
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "tuple_type",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "type_parameters",
            named: true
          }
        ]
      }
    },
    {
      type: "arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "attribute_item",
            named: true
          }
        ]
      }
    },
    {
      type: "array_expression",
      named: true,
      fields: {
        length: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "attribute_item",
            named: true
          }
        ]
      }
    },
    {
      type: "array_type",
      named: true,
      fields: {
        element: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        length: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "assignment_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "associated_type",
      named: true,
      fields: {
        bounds: {
          multiple: false,
          required: false,
          types: [
            {
              type: "trait_bounds",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "async_block",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "block",
            named: true
          }
        ]
      }
    },
    {
      type: "attribute",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "token_tree",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "scoped_identifier",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          }
        ]
      }
    },
    {
      type: "attribute_item",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "attribute",
            named: true
          }
        ]
      }
    },
    {
      type: "await_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "base_field_initializer",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "binary_expression",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "!=",
              named: false
            },
            {
              type: "%",
              named: false
            },
            {
              type: "&",
              named: false
            },
            {
              type: "&&",
              named: false
            },
            {
              type: "*",
              named: false
            },
            {
              type: "+",
              named: false
            },
            {
              type: "-",
              named: false
            },
            {
              type: "/",
              named: false
            },
            {
              type: "<",
              named: false
            },
            {
              type: "<<",
              named: false
            },
            {
              type: "<=",
              named: false
            },
            {
              type: "==",
              named: false
            },
            {
              type: ">",
              named: false
            },
            {
              type: ">=",
              named: false
            },
            {
              type: ">>",
              named: false
            },
            {
              type: "^",
              named: false
            },
            {
              type: "|",
              named: false
            },
            {
              type: "||",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "block",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_declaration_statement",
            named: true
          },
          {
            type: "_expression",
            named: true
          },
          {
            type: "expression_statement",
            named: true
          },
          {
            type: "label",
            named: true
          }
        ]
      }
    },
    {
      type: "block_comment",
      named: true,
      fields: {
        doc: {
          multiple: false,
          required: false,
          types: [
            {
              type: "doc_comment",
              named: true
            }
          ]
        },
        inner: {
          multiple: false,
          required: false,
          types: [
            {
              type: "inner_doc_comment_marker",
              named: true
            }
          ]
        },
        outer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "outer_doc_comment_marker",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "boolean_literal",
      named: true,
      fields: {}
    },
    {
      type: "bounded_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          },
          {
            type: "lifetime",
            named: true
          },
          {
            type: "use_bounds",
            named: true
          }
        ]
      }
    },
    {
      type: "bracketed_type",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          },
          {
            type: "qualified_type",
            named: true
          }
        ]
      }
    },
    {
      type: "break_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "label",
            named: true
          }
        ]
      }
    },
    {
      type: "call_expression",
      named: true,
      fields: {
        arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "arguments",
              named: true
            }
          ]
        },
        function: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_literal",
              named: true
            },
            {
              type: "array_expression",
              named: true
            },
            {
              type: "assignment_expression",
              named: true
            },
            {
              type: "async_block",
              named: true
            },
            {
              type: "await_expression",
              named: true
            },
            {
              type: "binary_expression",
              named: true
            },
            {
              type: "block",
              named: true
            },
            {
              type: "break_expression",
              named: true
            },
            {
              type: "call_expression",
              named: true
            },
            {
              type: "closure_expression",
              named: true
            },
            {
              type: "compound_assignment_expr",
              named: true
            },
            {
              type: "const_block",
              named: true
            },
            {
              type: "continue_expression",
              named: true
            },
            {
              type: "field_expression",
              named: true
            },
            {
              type: "for_expression",
              named: true
            },
            {
              type: "gen_block",
              named: true
            },
            {
              type: "generic_function",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "if_expression",
              named: true
            },
            {
              type: "index_expression",
              named: true
            },
            {
              type: "loop_expression",
              named: true
            },
            {
              type: "macro_invocation",
              named: true
            },
            {
              type: "match_expression",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "parenthesized_expression",
              named: true
            },
            {
              type: "reference_expression",
              named: true
            },
            {
              type: "return_expression",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "struct_expression",
              named: true
            },
            {
              type: "try_block",
              named: true
            },
            {
              type: "try_expression",
              named: true
            },
            {
              type: "tuple_expression",
              named: true
            },
            {
              type: "type_cast_expression",
              named: true
            },
            {
              type: "unary_expression",
              named: true
            },
            {
              type: "unit_expression",
              named: true
            },
            {
              type: "unsafe_block",
              named: true
            },
            {
              type: "while_expression",
              named: true
            },
            {
              type: "yield_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "captured_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "closure_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_",
              named: false
            },
            {
              type: "_expression",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "closure_parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "closure_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_pattern",
            named: true
          },
          {
            type: "parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "compound_assignment_expr",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        },
        operator: {
          multiple: false,
          required: true,
          types: [
            {
              type: "%=",
              named: false
            },
            {
              type: "&=",
              named: false
            },
            {
              type: "*=",
              named: false
            },
            {
              type: "+=",
              named: false
            },
            {
              type: "-=",
              named: false
            },
            {
              type: "/=",
              named: false
            },
            {
              type: "<<=",
              named: false
            },
            {
              type: ">>=",
              named: false
            },
            {
              type: "^=",
              named: false
            },
            {
              type: "|=",
              named: false
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "const_block",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "const_item",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "const_parameter",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_literal",
              named: true
            },
            {
              type: "block",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "negative_literal",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "continue_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "label",
            named: true
          }
        ]
      }
    },
    {
      type: "declaration_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_declaration_statement",
            named: true
          }
        ]
      }
    },
    {
      type: "dynamic_type",
      named: true,
      fields: {
        trait: {
          multiple: false,
          required: true,
          types: [
            {
              type: "function_type",
              named: true
            },
            {
              type: "generic_type",
              named: true
            },
            {
              type: "higher_ranked_trait_bound",
              named: true
            },
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "tuple_type",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "else_clause",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "block",
            named: true
          },
          {
            type: "if_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "empty_statement",
      named: true,
      fields: {}
    },
    {
      type: "enum_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "enum_variant_list",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          },
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "enum_variant",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "field_declaration_list",
              named: true
            },
            {
              type: "ordered_field_declaration_list",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "enum_variant_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "attribute_item",
            named: true
          },
          {
            type: "enum_variant",
            named: true
          }
        ]
      }
    },
    {
      type: "expression_statement",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "extern_crate_declaration",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: false,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "crate",
            named: true
          },
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "extern_modifier",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "string_literal",
            named: true
          }
        ]
      }
    },
    {
      type: "field_declaration",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "field_declaration_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "attribute_item",
            named: true
          },
          {
            type: "field_declaration",
            named: true
          }
        ]
      }
    },
    {
      type: "field_expression",
      named: true,
      fields: {
        field: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_identifier",
              named: true
            },
            {
              type: "integer_literal",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "field_initializer",
      named: true,
      fields: {
        field: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_identifier",
              named: true
            },
            {
              type: "integer_literal",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "attribute_item",
            named: true
          }
        ]
      }
    },
    {
      type: "field_initializer_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "base_field_initializer",
            named: true
          },
          {
            type: "field_initializer",
            named: true
          },
          {
            type: "shorthand_field_initializer",
            named: true
          }
        ]
      }
    },
    {
      type: "field_pattern",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_identifier",
              named: true
            },
            {
              type: "shorthand_field_identifier",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_pattern",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "for_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_pattern",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "label",
            named: true
          }
        ]
      }
    },
    {
      type: "for_lifetimes",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "lifetime",
            named: true
          }
        ]
      }
    },
    {
      type: "foreign_mod_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "declaration_list",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "extern_modifier",
            named: true
          },
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "fragment_specifier",
      named: true,
      fields: {}
    },
    {
      type: "function_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "function_modifiers",
            named: true
          },
          {
            type: "visibility_modifier",
            named: true
          },
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "function_modifiers",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "extern_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "function_signature_item",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            }
          ]
        },
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "function_modifiers",
            named: true
          },
          {
            type: "visibility_modifier",
            named: true
          },
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "function_type",
      named: true,
      fields: {
        parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "parameters",
              named: true
            }
          ]
        },
        return_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        trait: {
          multiple: false,
          required: false,
          types: [
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "for_lifetimes",
            named: true
          },
          {
            type: "function_modifiers",
            named: true
          }
        ]
      }
    },
    {
      type: "gen_block",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "block",
            named: true
          }
        ]
      }
    },
    {
      type: "generic_function",
      named: true,
      fields: {
        function: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_expression",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generic_pattern",
      named: true,
      fields: {
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          },
          {
            type: "scoped_identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "generic_type",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "generic_type_with_turbofish",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "higher_ranked_trait_bound",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "if_expression",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "else_clause",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            },
            {
              type: "let_chain",
              named: true
            },
            {
              type: "let_condition",
              named: true
            }
          ]
        },
        consequence: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "impl_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "declaration_list",
              named: true
            }
          ]
        },
        trait: {
          multiple: false,
          required: false,
          types: [
            {
              type: "generic_type",
              named: true
            },
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "index_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "inner_attribute_item",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "attribute",
            named: true
          }
        ]
      }
    },
    {
      type: "inner_doc_comment_marker",
      named: true,
      fields: {}
    },
    {
      type: "label",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "let_chain",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "let_condition",
            named: true
          }
        ]
      }
    },
    {
      type: "let_condition",
      named: true,
      fields: {
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_pattern",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "let_declaration",
      named: true,
      fields: {
        alternative: {
          multiple: false,
          required: false,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_pattern",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "lifetime",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "lifetime_parameter",
      named: true,
      fields: {
        bounds: {
          multiple: false,
          required: false,
          types: [
            {
              type: "trait_bounds",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "lifetime",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "line_comment",
      named: true,
      fields: {
        doc: {
          multiple: false,
          required: false,
          types: [
            {
              type: "doc_comment",
              named: true
            }
          ]
        },
        inner: {
          multiple: false,
          required: false,
          types: [
            {
              type: "inner_doc_comment_marker",
              named: true
            }
          ]
        },
        outer: {
          multiple: false,
          required: false,
          types: [
            {
              type: "outer_doc_comment_marker",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "loop_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "label",
            named: true
          }
        ]
      }
    },
    {
      type: "macro_definition",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "macro_rule",
            named: true
          }
        ]
      }
    },
    {
      type: "macro_invocation",
      named: true,
      fields: {
        macro: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "token_tree",
            named: true
          }
        ]
      }
    },
    {
      type: "macro_rule",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "token_tree_pattern",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: true,
          types: [
            {
              type: "token_tree",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "match_arm",
      named: true,
      fields: {
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "match_pattern",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "attribute_item",
            named: true
          },
          {
            type: "inner_attribute_item",
            named: true
          }
        ]
      }
    },
    {
      type: "match_block",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "match_arm",
            named: true
          }
        ]
      }
    },
    {
      type: "match_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "match_block",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "match_pattern",
      named: true,
      fields: {
        condition: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            },
            {
              type: "let_chain",
              named: true
            },
            {
              type: "let_condition",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "mod_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "declaration_list",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "mut_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_pattern",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "negative_literal",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "float_literal",
            named: true
          },
          {
            type: "integer_literal",
            named: true
          }
        ]
      }
    },
    {
      type: "never_type",
      named: true,
      fields: {}
    },
    {
      type: "or_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "ordered_field_declaration_list",
      named: true,
      fields: {
        type: {
          multiple: true,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "attribute_item",
            named: true
          },
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "outer_doc_comment_marker",
      named: true,
      fields: {}
    },
    {
      type: "parameter",
      named: true,
      fields: {
        pattern: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_pattern",
              named: true
            },
            {
              type: "self",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_type",
            named: true
          },
          {
            type: "attribute_item",
            named: true
          },
          {
            type: "parameter",
            named: true
          },
          {
            type: "self_parameter",
            named: true
          },
          {
            type: "variadic_parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "parenthesized_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "pointer_type",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "qualified_type",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "range_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "range_pattern",
      named: true,
      fields: {
        left: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_literal_pattern",
              named: true
            },
            {
              type: "crate",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "super",
              named: true
            }
          ]
        },
        right: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_literal_pattern",
              named: true
            },
            {
              type: "crate",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "super",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "raw_string_literal",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "string_content",
            named: true
          }
        ]
      }
    },
    {
      type: "ref_pattern",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "reference_expression",
      named: true,
      fields: {
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "reference_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_pattern",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "reference_type",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "lifetime",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "remaining_field_pattern",
      named: true,
      fields: {}
    },
    {
      type: "removed_trait_bound",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "return_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "scoped_identifier",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            },
            {
              type: "super",
              named: true
            }
          ]
        },
        path: {
          multiple: false,
          required: false,
          types: [
            {
              type: "bracketed_type",
              named: true
            },
            {
              type: "crate",
              named: true
            },
            {
              type: "generic_type",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "super",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "scoped_type_identifier",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        path: {
          multiple: false,
          required: false,
          types: [
            {
              type: "bracketed_type",
              named: true
            },
            {
              type: "crate",
              named: true
            },
            {
              type: "generic_type",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "super",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "scoped_use_list",
      named: true,
      fields: {
        list: {
          multiple: false,
          required: true,
          types: [
            {
              type: "use_list",
              named: true
            }
          ]
        },
        path: {
          multiple: false,
          required: false,
          types: [
            {
              type: "crate",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "super",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "self_parameter",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "lifetime",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          },
          {
            type: "self",
            named: true
          }
        ]
      }
    },
    {
      type: "shorthand_field_initializer",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "attribute_item",
            named: true
          },
          {
            type: "identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "slice_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "source_file",
      named: true,
      root: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_declaration_statement",
            named: true
          },
          {
            type: "expression_statement",
            named: true
          },
          {
            type: "shebang",
            named: true
          }
        ]
      }
    },
    {
      type: "static_item",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "mutable_specifier",
            named: true
          },
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "string_literal",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "escape_sequence",
            named: true
          },
          {
            type: "string_content",
            named: true
          }
        ]
      }
    },
    {
      type: "struct_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_initializer_list",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "generic_type_with_turbofish",
              named: true
            },
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "struct_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: false,
          types: [
            {
              type: "field_declaration_list",
              named: true
            },
            {
              type: "ordered_field_declaration_list",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          },
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "struct_pattern",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "field_pattern",
            named: true
          },
          {
            type: "remaining_field_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "token_binding_pattern",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "metavariable",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "fragment_specifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "token_repetition",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_literal",
            named: true
          },
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          },
          {
            type: "primitive_type",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          },
          {
            type: "token_repetition",
            named: true
          },
          {
            type: "token_tree",
            named: true
          }
        ]
      }
    },
    {
      type: "token_repetition_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_literal",
            named: true
          },
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          },
          {
            type: "primitive_type",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          },
          {
            type: "token_binding_pattern",
            named: true
          },
          {
            type: "token_repetition_pattern",
            named: true
          },
          {
            type: "token_tree_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "token_tree",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_literal",
            named: true
          },
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          },
          {
            type: "primitive_type",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          },
          {
            type: "token_repetition",
            named: true
          },
          {
            type: "token_tree",
            named: true
          }
        ]
      }
    },
    {
      type: "token_tree_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_literal",
            named: true
          },
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "mutable_specifier",
            named: true
          },
          {
            type: "primitive_type",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          },
          {
            type: "token_binding_pattern",
            named: true
          },
          {
            type: "token_repetition_pattern",
            named: true
          },
          {
            type: "token_tree_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "trait_bounds",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          },
          {
            type: "higher_ranked_trait_bound",
            named: true
          },
          {
            type: "lifetime",
            named: true
          }
        ]
      }
    },
    {
      type: "trait_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "declaration_list",
              named: true
            }
          ]
        },
        bounds: {
          multiple: false,
          required: false,
          types: [
            {
              type: "trait_bounds",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          },
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "try_block",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "block",
            named: true
          }
        ]
      }
    },
    {
      type: "try_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "tuple_expression",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          },
          {
            type: "attribute_item",
            named: true
          }
        ]
      }
    },
    {
      type: "tuple_pattern",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_pattern",
            named: true
          },
          {
            type: "closure_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "tuple_struct_pattern",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "generic_type",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "_pattern",
            named: true
          }
        ]
      }
    },
    {
      type: "tuple_type",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_type",
            named: true
          }
        ]
      }
    },
    {
      type: "type_arguments",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "_literal",
            named: true
          },
          {
            type: "_type",
            named: true
          },
          {
            type: "block",
            named: true
          },
          {
            type: "lifetime",
            named: true
          },
          {
            type: "trait_bounds",
            named: true
          },
          {
            type: "type_binding",
            named: true
          }
        ]
      }
    },
    {
      type: "type_binding",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type_arguments: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_arguments",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_cast_expression",
      named: true,
      fields: {
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        value: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_item",
      named: true,
      fields: {
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          },
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "type_parameter",
      named: true,
      fields: {
        bounds: {
          multiple: false,
          required: false,
          types: [
            {
              type: "trait_bounds",
              named: true
            }
          ]
        },
        default_type: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_type",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "type_parameters",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: true,
        types: [
          {
            type: "attribute_item",
            named: true
          },
          {
            type: "const_parameter",
            named: true
          },
          {
            type: "lifetime_parameter",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "type_parameter",
            named: true
          }
        ]
      }
    },
    {
      type: "unary_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "union_item",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "field_declaration_list",
              named: true
            }
          ]
        },
        name: {
          multiple: false,
          required: true,
          types: [
            {
              type: "type_identifier",
              named: true
            }
          ]
        },
        type_parameters: {
          multiple: false,
          required: false,
          types: [
            {
              type: "type_parameters",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          },
          {
            type: "where_clause",
            named: true
          }
        ]
      }
    },
    {
      type: "unit_expression",
      named: true,
      fields: {}
    },
    {
      type: "unit_type",
      named: true,
      fields: {}
    },
    {
      type: "unsafe_block",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: true,
        types: [
          {
            type: "block",
            named: true
          }
        ]
      }
    },
    {
      type: "use_as_clause",
      named: true,
      fields: {
        alias: {
          multiple: false,
          required: true,
          types: [
            {
              type: "identifier",
              named: true
            }
          ]
        },
        path: {
          multiple: false,
          required: true,
          types: [
            {
              type: "crate",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "super",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "use_bounds",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "lifetime",
            named: true
          },
          {
            type: "type_identifier",
            named: true
          }
        ]
      }
    },
    {
      type: "use_declaration",
      named: true,
      fields: {
        argument: {
          multiple: false,
          required: true,
          types: [
            {
              type: "crate",
              named: true
            },
            {
              type: "identifier",
              named: true
            },
            {
              type: "metavariable",
              named: true
            },
            {
              type: "scoped_identifier",
              named: true
            },
            {
              type: "scoped_use_list",
              named: true
            },
            {
              type: "self",
              named: true
            },
            {
              type: "super",
              named: true
            },
            {
              type: "use_as_clause",
              named: true
            },
            {
              type: "use_list",
              named: true
            },
            {
              type: "use_wildcard",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "visibility_modifier",
            named: true
          }
        ]
      }
    },
    {
      type: "use_list",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "scoped_identifier",
            named: true
          },
          {
            type: "scoped_use_list",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          },
          {
            type: "use_as_clause",
            named: true
          },
          {
            type: "use_list",
            named: true
          },
          {
            type: "use_wildcard",
            named: true
          }
        ]
      }
    },
    {
      type: "use_wildcard",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "scoped_identifier",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          }
        ]
      }
    },
    {
      type: "variadic_parameter",
      named: true,
      fields: {
        pattern: {
          multiple: false,
          required: false,
          types: [
            {
              type: "_pattern",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "mutable_specifier",
            named: true
          }
        ]
      }
    },
    {
      type: "visibility_modifier",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "crate",
            named: true
          },
          {
            type: "identifier",
            named: true
          },
          {
            type: "metavariable",
            named: true
          },
          {
            type: "scoped_identifier",
            named: true
          },
          {
            type: "self",
            named: true
          },
          {
            type: "super",
            named: true
          }
        ]
      }
    },
    {
      type: "where_clause",
      named: true,
      fields: {},
      children: {
        multiple: true,
        required: false,
        types: [
          {
            type: "where_predicate",
            named: true
          }
        ]
      }
    },
    {
      type: "where_predicate",
      named: true,
      fields: {
        bounds: {
          multiple: false,
          required: true,
          types: [
            {
              type: "trait_bounds",
              named: true
            }
          ]
        },
        left: {
          multiple: false,
          required: true,
          types: [
            {
              type: "array_type",
              named: true
            },
            {
              type: "generic_type",
              named: true
            },
            {
              type: "higher_ranked_trait_bound",
              named: true
            },
            {
              type: "lifetime",
              named: true
            },
            {
              type: "pointer_type",
              named: true
            },
            {
              type: "primitive_type",
              named: true
            },
            {
              type: "reference_type",
              named: true
            },
            {
              type: "scoped_type_identifier",
              named: true
            },
            {
              type: "tuple_type",
              named: true
            },
            {
              type: "type_identifier",
              named: true
            }
          ]
        }
      }
    },
    {
      type: "while_expression",
      named: true,
      fields: {
        body: {
          multiple: false,
          required: true,
          types: [
            {
              type: "block",
              named: true
            }
          ]
        },
        condition: {
          multiple: false,
          required: true,
          types: [
            {
              type: "_expression",
              named: true
            },
            {
              type: "let_chain",
              named: true
            },
            {
              type: "let_condition",
              named: true
            }
          ]
        }
      },
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "label",
            named: true
          }
        ]
      }
    },
    {
      type: "yield_expression",
      named: true,
      fields: {},
      children: {
        multiple: false,
        required: false,
        types: [
          {
            type: "_expression",
            named: true
          }
        ]
      }
    },
    {
      type: "!",
      named: false
    },
    {
      type: "!=",
      named: false
    },
    {
      type: '"',
      named: false
    },
    {
      type: "#",
      named: false
    },
    {
      type: "$",
      named: false
    },
    {
      type: "%",
      named: false
    },
    {
      type: "%=",
      named: false
    },
    {
      type: "&",
      named: false
    },
    {
      type: "&&",
      named: false
    },
    {
      type: "&=",
      named: false
    },
    {
      type: "'",
      named: false
    },
    {
      type: "(",
      named: false
    },
    {
      type: ")",
      named: false
    },
    {
      type: "*",
      named: false
    },
    {
      type: "*/",
      named: false
    },
    {
      type: "*=",
      named: false
    },
    {
      type: "+",
      named: false
    },
    {
      type: "+=",
      named: false
    },
    {
      type: ",",
      named: false
    },
    {
      type: "-",
      named: false
    },
    {
      type: "-=",
      named: false
    },
    {
      type: "->",
      named: false
    },
    {
      type: ".",
      named: false
    },
    {
      type: "..",
      named: false
    },
    {
      type: "...",
      named: false
    },
    {
      type: "..=",
      named: false
    },
    {
      type: "/",
      named: false
    },
    {
      type: "/*",
      named: false
    },
    {
      type: "//",
      named: false
    },
    {
      type: "/=",
      named: false
    },
    {
      type: ":",
      named: false
    },
    {
      type: "::",
      named: false
    },
    {
      type: ";",
      named: false
    },
    {
      type: "<",
      named: false
    },
    {
      type: "<<",
      named: false
    },
    {
      type: "<<=",
      named: false
    },
    {
      type: "<=",
      named: false
    },
    {
      type: "=",
      named: false
    },
    {
      type: "==",
      named: false
    },
    {
      type: "=>",
      named: false
    },
    {
      type: ">",
      named: false
    },
    {
      type: ">=",
      named: false
    },
    {
      type: ">>",
      named: false
    },
    {
      type: ">>=",
      named: false
    },
    {
      type: "?",
      named: false
    },
    {
      type: "@",
      named: false
    },
    {
      type: "[",
      named: false
    },
    {
      type: "]",
      named: false
    },
    {
      type: "^",
      named: false
    },
    {
      type: "^=",
      named: false
    },
    {
      type: "_",
      named: false
    },
    {
      type: "as",
      named: false
    },
    {
      type: "async",
      named: false
    },
    {
      type: "await",
      named: false
    },
    {
      type: "block",
      named: false
    },
    {
      type: "break",
      named: false
    },
    {
      type: "char_literal",
      named: true
    },
    {
      type: "const",
      named: false
    },
    {
      type: "continue",
      named: false
    },
    {
      type: "crate",
      named: true
    },
    {
      type: "default",
      named: false
    },
    {
      type: "doc_comment",
      named: true
    },
    {
      type: "dyn",
      named: false
    },
    {
      type: "else",
      named: false
    },
    {
      type: "enum",
      named: false
    },
    {
      type: "escape_sequence",
      named: true
    },
    {
      type: "expr",
      named: false
    },
    {
      type: "expr_2021",
      named: false
    },
    {
      type: "extern",
      named: false
    },
    {
      type: "false",
      named: false
    },
    {
      type: "field_identifier",
      named: true
    },
    {
      type: "float_literal",
      named: true
    },
    {
      type: "fn",
      named: false
    },
    {
      type: "for",
      named: false
    },
    {
      type: "gen",
      named: false
    },
    {
      type: "ident",
      named: false
    },
    {
      type: "identifier",
      named: true
    },
    {
      type: "if",
      named: false
    },
    {
      type: "impl",
      named: false
    },
    {
      type: "in",
      named: false
    },
    {
      type: "integer_literal",
      named: true
    },
    {
      type: "item",
      named: false
    },
    {
      type: "let",
      named: false
    },
    {
      type: "lifetime",
      named: false
    },
    {
      type: "literal",
      named: false
    },
    {
      type: "loop",
      named: false
    },
    {
      type: "macro_rules!",
      named: false
    },
    {
      type: "match",
      named: false
    },
    {
      type: "meta",
      named: false
    },
    {
      type: "metavariable",
      named: true
    },
    {
      type: "mod",
      named: false
    },
    {
      type: "move",
      named: false
    },
    {
      type: "mutable_specifier",
      named: true
    },
    {
      type: "pat",
      named: false
    },
    {
      type: "pat_param",
      named: false
    },
    {
      type: "path",
      named: false
    },
    {
      type: "primitive_type",
      named: true
    },
    {
      type: "pub",
      named: false
    },
    {
      type: "raw",
      named: false
    },
    {
      type: "ref",
      named: false
    },
    {
      type: "return",
      named: false
    },
    {
      type: "self",
      named: true
    },
    {
      type: "shebang",
      named: true
    },
    {
      type: "shorthand_field_identifier",
      named: true
    },
    {
      type: "static",
      named: false
    },
    {
      type: "stmt",
      named: false
    },
    {
      type: "string_content",
      named: true
    },
    {
      type: "struct",
      named: false
    },
    {
      type: "super",
      named: true
    },
    {
      type: "trait",
      named: false
    },
    {
      type: "true",
      named: false
    },
    {
      type: "try",
      named: false
    },
    {
      type: "tt",
      named: false
    },
    {
      type: "ty",
      named: false
    },
    {
      type: "type",
      named: false
    },
    {
      type: "type_identifier",
      named: true
    },
    {
      type: "union",
      named: false
    },
    {
      type: "unsafe",
      named: false
    },
    {
      type: "use",
      named: false
    },
    {
      type: "vis",
      named: false
    },
    {
      type: "where",
      named: false
    },
    {
      type: "while",
      named: false
    },
    {
      type: "yield",
      named: false
    },
    {
      type: "{",
      named: false
    },
    {
      type: "|",
      named: false
    },
    {
      type: "|=",
      named: false
    },
    {
      type: "||",
      named: false
    },
    {
      type: "}",
      named: false
    }
  ];
});

// node_modules/tree-sitter-rust/bindings/node/index.js
var require_node5 = __commonJS((exports, module) => {
  var __dirname = "/root/code/HashPilot/node_modules/tree-sitter-rust/bindings/node";
  var root2 = __require("path").join(__dirname, "..", "..");
  module.exports = typeof process.versions.bun === "string" ? __require(`../../prebuilds/${process.platform}-${process.arch}/tree-sitter-rust.node`) : require_node_gyp_build2()(root2);
  try {
    module.exports.nodeTypeInfo = require_node_types6();
  } catch (_) {}
});

// node_modules/balanced-match/index.js
var require_balanced_match = __commonJS((exports, module) => {
  module.exports = balanced;
  function balanced(a, b, str) {
    if (a instanceof RegExp)
      a = maybeMatch(a, str);
    if (b instanceof RegExp)
      b = maybeMatch(b, str);
    var r = range(a, b, str);
    return r && {
      start: r[0],
      end: r[1],
      pre: str.slice(0, r[0]),
      body: str.slice(r[0] + a.length, r[1]),
      post: str.slice(r[1] + b.length)
    };
  }
  function maybeMatch(reg, str) {
    var m = str.match(reg);
    return m ? m[0] : null;
  }
  balanced.range = range;
  function range(a, b, str) {
    var begs, beg, left, right, result;
    var ai = str.indexOf(a);
    var bi = str.indexOf(b, ai + 1);
    var i = ai;
    if (ai >= 0 && bi > 0) {
      if (a === b) {
        return [ai, bi];
      }
      begs = [];
      left = str.length;
      while (i >= 0 && !result) {
        if (i == ai) {
          begs.push(i);
          ai = str.indexOf(a, i + 1);
        } else if (begs.length == 1) {
          result = [begs.pop(), bi];
        } else {
          beg = begs.pop();
          if (beg < left) {
            left = beg;
            right = bi;
          }
          bi = str.indexOf(b, i + 1);
        }
        i = ai < bi && ai >= 0 ? ai : bi;
      }
      if (begs.length) {
        result = [left, right];
      }
    }
    return result;
  }
});

// node_modules/brace-expansion/index.js
var require_brace_expansion = __commonJS((exports, module) => {
  var balanced = require_balanced_match();
  module.exports = expandTop;
  var escSlash = "\x00SLASH" + Math.random() + "\x00";
  var escOpen = "\x00OPEN" + Math.random() + "\x00";
  var escClose = "\x00CLOSE" + Math.random() + "\x00";
  var escComma = "\x00COMMA" + Math.random() + "\x00";
  var escPeriod = "\x00PERIOD" + Math.random() + "\x00";
  function numeric(str) {
    return parseInt(str, 10) == str ? parseInt(str, 10) : str.charCodeAt(0);
  }
  function escapeBraces(str) {
    return str.split("\\\\").join(escSlash).split("\\{").join(escOpen).split("\\}").join(escClose).split("\\,").join(escComma).split("\\.").join(escPeriod);
  }
  function unescapeBraces(str) {
    return str.split(escSlash).join("\\").split(escOpen).join("{").split(escClose).join("}").split(escComma).join(",").split(escPeriod).join(".");
  }
  function parseCommaParts(str) {
    if (!str)
      return [""];
    var parts = [];
    var m = balanced("{", "}", str);
    if (!m)
      return str.split(",");
    var pre = m.pre;
    var body = m.body;
    var post = m.post;
    var p = pre.split(",");
    p[p.length - 1] += "{" + body + "}";
    var postParts = parseCommaParts(post);
    if (post.length) {
      p[p.length - 1] += postParts.shift();
      p.push.apply(p, postParts);
    }
    parts.push.apply(parts, p);
    return parts;
  }
  function expandTop(str, options) {
    if (!str)
      return [];
    options = options || {};
    var max = options.max == null ? Infinity : options.max;
    if (str.substr(0, 2) === "{}") {
      str = "\\{\\}" + str.substr(2);
    }
    return expand(escapeBraces(str), max, true).map(unescapeBraces);
  }
  function embrace(str) {
    return "{" + str + "}";
  }
  function isPadded(el) {
    return /^-?0\d/.test(el);
  }
  function lte(i, y) {
    return i <= y;
  }
  function gte(i, y) {
    return i >= y;
  }
  function expand(str, max, isTop) {
    var expansions = [];
    var m = balanced("{", "}", str);
    if (!m)
      return [str];
    var pre = m.pre;
    var post = m.post.length ? expand(m.post, max, false) : [""];
    if (/\$$/.test(m.pre)) {
      for (var k = 0;k < post.length && k < max; k++) {
        var expansion = pre + "{" + m.body + "}" + post[k];
        expansions.push(expansion);
      }
    } else {
      var isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
      var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
      var isSequence = isNumericSequence || isAlphaSequence;
      var isOptions = m.body.indexOf(",") >= 0;
      if (!isSequence && !isOptions) {
        if (m.post.match(/,(?!,).*\}/)) {
          str = m.pre + "{" + m.body + escClose + m.post;
          return expand(str, max, true);
        }
        return [str];
      }
      var n2;
      if (isSequence) {
        n2 = m.body.split(/\.\./);
      } else {
        n2 = parseCommaParts(m.body);
        if (n2.length === 1) {
          n2 = expand(n2[0], max, false).map(embrace);
          if (n2.length === 1) {
            return post.map(function(p) {
              return m.pre + n2[0] + p;
            });
          }
        }
      }
      var N;
      if (isSequence) {
        var x = numeric(n2[0]);
        var y = numeric(n2[1]);
        var width = Math.max(n2[0].length, n2[1].length);
        var incr = n2.length == 3 ? Math.max(Math.abs(numeric(n2[2])), 1) : 1;
        var test = lte;
        var reverse = y < x;
        if (reverse) {
          incr *= -1;
          test = gte;
        }
        var pad = n2.some(isPadded);
        N = [];
        for (var i = x;test(i, y); i += incr) {
          var c;
          if (isAlphaSequence) {
            c = String.fromCharCode(i);
            if (c === "\\")
              c = "";
          } else {
            c = String(i);
            if (pad) {
              var need = width - c.length;
              if (need > 0) {
                var z = new Array(need + 1).join("0");
                if (i < 0)
                  c = "-" + z + c.slice(1);
                else
                  c = z + c;
              }
            }
          }
          N.push(c);
        }
      } else {
        N = [];
        for (var j = 0;j < n2.length; j++) {
          N.push.apply(N, expand(n2[j], max, false));
        }
      }
      for (var j = 0;j < N.length; j++) {
        for (var k = 0;k < post.length && expansions.length < max; k++) {
          var expansion = pre + N[j] + post[k];
          if (!isTop || isSequence || expansion)
            expansions.push(expansion);
        }
      }
    }
    return expansions;
  }
});

// node_modules/commander/esm.mjs
var import__ = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  Command,
  Argument,
  Option,
  Help
} = import__.default;
// package.json
var package_default = {
  name: "hashpilot",
  version: "3.0.3",
  description: "HashPilot — Global Tool-Agnostic Structured Editing Core for Coding Agents",
  type: "module",
  bin: {
    "structured-edit": "./src/cli.ts"
  },
  scripts: {
    test: "bun test",
    build: "bun build src/cli.ts --outdir dist --target bun",
    "install-cli": "ln -sf $(pwd)/src/cli.ts ~/.agentic-tools/bin/structured-edit",
    "semantic-release": "semantic-release",
    "gen:cli-quickref": "bun run scripts/gen-cli-quickref.ts",
    "gen:cli-quickref:check": "bun run scripts/gen-cli-quickref.ts --check",
    "lint:roadmap": "bun run scripts/roadmap-lint.ts",
    "lint:docs": "bun run gen:cli-quickref:check && bun run lint:roadmap"
  },
  files: [
    "src/",
    "scripts/",
    "templates/",
    "docs/",
    "LICENSE",
    "package.json",
    "tsconfig.json"
  ],
  repository: {
    type: "git",
    url: "git+https://github.com/bigknoxy/HashPilot.git"
  },
  keywords: [
    "structured-editing",
    "coding-agents",
    "tree-sitter",
    "claude",
    "opencode",
    "pi"
  ],
  author: "bigknoxy",
  license: "MIT",
  bugs: {
    url: "https://github.com/bigknoxy/HashPilot/issues"
  },
  homepage: "https://github.com/bigknoxy/HashPilot#readme",
  dependencies: {
    chalk: "^5.3.0",
    commander: "^12.1.0",
    glob: "^10.3.10",
    "tree-sitter": "^0.21.1",
    "tree-sitter-go": "0.21.2",
    "tree-sitter-javascript": "0.21.4",
    "tree-sitter-python": "^0.21.0",
    "tree-sitter-rust": "^0.24.0",
    "tree-sitter-typescript": "^0.21.2"
  },
  devDependencies: {
    "@types/bun": "^1.1.0",
    "@types/node": "^20.11.0",
    "semantic-release": "^24.2.0",
    "@semantic-release/github": "^11.0.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0",
    "@semantic-release/changelog": "^6.0.3",
    "@semantic-release/git": "^10.0.1",
    "conventional-changelog-conventionalcommits": "^8.0.0",
    "@semantic-release/npm": "^12.0.1"
  }
};

// src/core/read.ts
import { createHash } from "crypto";
var HASH_WIDTH = 12;
function computeHash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, HASH_WIDTH);
}
function computeLineHash(line) {
  return computeHash(line);
}
async function readMany(files) {
  const results = await Promise.all(files.map(async (p) => {
    try {
      const content = await Bun.file(p).text();
      return {
        path: p,
        content,
        hash: computeHash(content),
        lines: content.split(`
`).length - (content.endsWith(`
`) ? 1 : 0)
      };
    } catch (e) {
      return { path: p, content: "", hash: "", lines: 0, error: e.message };
    }
  }));
  return results;
}
async function readHash(filePath, line, contextLines = 3) {
  try {
    const content = await Bun.file(filePath).text();
    const lines = content.split(`
`);
    const targetLine = lines[line - 1];
    if (!targetLine) {
      return {
        path: filePath,
        line,
        content: "",
        lineHash: "",
        contextHash: "",
        contextBefore: [],
        contextAfter: [],
        error: `Line ${line} out of range (file has ${lines.length} lines)`
      };
    }
    const start = Math.max(0, line - 1 - contextLines);
    const end = Math.min(lines.length, line - 1 + contextLines + 1);
    const before = lines.slice(start, line - 1);
    const after = lines.slice(line, end);
    const contextText = [...before, targetLine, ...after].join(`
`);
    return {
      path: filePath,
      line,
      content: targetLine,
      lineHash: computeLineHash(targetLine),
      contextHash: computeHash(contextText),
      contextBefore: before,
      contextAfter: after
    };
  } catch (e) {
    return {
      path: filePath,
      line,
      content: "",
      lineHash: "",
      contextHash: "",
      contextBefore: [],
      contextAfter: [],
      error: e.message
    };
  }
}
// src/core/grep.ts
import { spawn } from "child_process";

// src/core/utils.ts
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/core/grep.ts
async function grepMany(pattern, paths, options = {}) {
  const start = Date.now();
  try {
    const args = ["-rn"];
    if (options.ignoreCase)
      args.push("-i");
    if (options.wordMatch)
      args.push("-w");
    if (options.filePattern)
      args.push("--include", options.filePattern);
    if (options.maxResults)
      args.push("-m", String(options.maxResults));
    args.push("-E", pattern, ...paths);
    const result = await runCommand("grep", args);
    const lines = result.stdout.split(`
`).filter(Boolean);
    const results = lines.flatMap((line) => {
      let m = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
      if (m) {
        return [{ path: m[1], line: parseInt(m[2]), column: parseInt(m[3]), content: m[4], match: pattern }];
      }
      m = line.match(/^(\d+):(.*)$/);
      if (m) {
        return [{ path: paths[0], line: parseInt(m[1]), column: 1, content: m[2], match: pattern }];
      }
      m = line.match(/^([^:]+):(\d+):(.*)$/);
      if (m) {
        return [{ path: m[1], line: parseInt(m[2]), column: 1, content: m[3], match: pattern }];
      }
      return [];
    });
    return { pattern, results, elapsed_ms: Date.now() - start };
  } catch (e) {
    if (e?.code === 1 && !e.stderr) {
      return { pattern, results: [], elapsed_ms: Date.now() - start };
    }
    return {
      pattern,
      results: [],
      error: e.message,
      elapsed_ms: Date.now() - start
    };
  }
}
async function symbolLookupMany(names, paths) {
  const results = [];
  for (const name of names) {
    const grepRes = await grepMany(`\\b(function|class|interface|type|const|let|var|export)\\s+${escapeRegex(name)}\\b`, paths, { maxResults: 20 });
    for (const r of grepRes.results) {
      results.push({
        name,
        path: r.path,
        line: r.line,
        kind: detectSymbolKind(r.content, name)
      });
    }
  }
  return results;
}
function detectSymbolKind(content, _name) {
  const trimmed = content.trim();
  const stripped = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
  if (stripped.startsWith("function "))
    return "function";
  if (stripped.startsWith("class "))
    return "class";
  if (stripped.startsWith("interface "))
    return "interface";
  if (stripped.startsWith("type "))
    return "type";
  if (stripped.startsWith("const "))
    return "const";
  if (stripped.startsWith("let "))
    return "let";
  if (stripped.startsWith("var "))
    return "var";
  return "unknown";
}
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => stdout += d);
    proc.stderr.on("data", (d) => stderr += d);
    proc.on("close", (code) => {
      if (code === 1 && !stderr) {
        resolve({ stdout, stderr, code });
      } else if (code !== 0) {
        const err = new Error(`Command failed: ${cmd} ${args.join(" ")}`);
        err.code = code;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr, code });
      }
    });
    proc.on("error", reject);
  });
}
// src/core/telemetry.ts
import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync, renameSync, unlinkSync, statSync, readdirSync, chmodSync } from "fs";
import { join } from "path";

// src/core/redact.ts
import { basename } from "node:path";
var REDACTED = "[REDACTED]";
var RULES = [
  { name: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/g, replacement: REDACTED },
  { name: "aws-secret-access-key", pattern: /\b(aws_secret_access_key\s*[:=]\s*)\S+/gi, replacement: `$1${REDACTED}` },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
  { name: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g, replacement: REDACTED },
  { name: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, replacement: REDACTED },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replacement: REDACTED },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: REDACTED },
  { name: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: `-----BEGIN PRIVATE KEY-----${REDACTED}-----END PRIVATE KEY-----` },
  { name: "authorization-header", pattern: /\b(authorization\s*[:=]\s*["']?)(?:bearer|basic|token)\s+\S+/gi, replacement: `$1${REDACTED}` },
  { name: "connection-string-password", pattern: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(@)/gi, replacement: `$1${REDACTED}$2` },
  {
    name: "secretish-assignment",
    pattern: /\b([A-Za-z0-9_.-]*(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|credential)[A-Za-z0-9_.-]*\s*[:=]\s*)(["']?)([^\s"',;)}]{6,})\2/gi,
    replacement: `$1$2${REDACTED}$2`
  }
];
function redactSecrets(input) {
  let out = input;
  for (const rule of RULES)
    out = out.replace(rule.pattern, rule.replacement);
  return out;
}
var SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^credentials$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^.*\.keystore$/i,
  /^secrets?\.(ya?ml|json|toml)$/i
];
function isSensitiveFile(filePath) {
  const name = basename(filePath);
  return SENSITIVE_FILE_PATTERNS.some((re) => re.test(name));
}
function redactEvent(event) {
  const walk = (value) => {
    if (typeof value === "string")
      return redactSecrets(value);
    if (Array.isArray(value))
      return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(event);
}

// src/core/telemetry.ts
var LOG_DIR = join(process.env.HOME || "/root", ".agentic-tools", "logs");
var LOG_FILE = join(LOG_DIR, "telemetry.jsonl");
var ROTATED_FILE_RE = /^telemetry-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.jsonl$/;
var MAX_FILE_SIZE = 10 * 1024 * 1024;
var MAX_ROTATED_FILES = 10;
var RETENTION_DAYS = 30;
function configureTelemetry(cfg) {
  if (!cfg)
    return;
  if (cfg.maxFileSize !== undefined)
    MAX_FILE_SIZE = cfg.maxFileSize;
  if (cfg.maxRotatedFiles !== undefined)
    MAX_ROTATED_FILES = cfg.maxRotatedFiles;
  if (cfg.retentionDays !== undefined)
    RETENTION_DAYS = cfg.retentionDays;
  if (cfg.enabled !== undefined)
    sessionEnabled = cfg.enabled;
}
function resolveTelemetryEnabled(cfg, cliDisabled) {
  if (cliDisabled)
    return false;
  const env = process.env.HASHPILOT_TELEMETRY;
  if (env !== undefined && ["0", "false", "off", "no"].includes(env.trim().toLowerCase()))
    return false;
  if (cfg?.enabled !== undefined)
    return cfg.enabled;
  return true;
}
var sessionId = crypto.randomUUID();
var sessionEnabled = true;
function enableTelemetry(on = true) {
  sessionEnabled = on;
}
function ensureLogDir() {
  if (!existsSync(LOG_DIR))
    mkdirSync(LOG_DIR, { recursive: true, mode: 448 });
}
function tightenLogPermissions() {
  try {
    if ((statSync(LOG_DIR).mode & 63) !== 0)
      chmodSync(LOG_DIR, 448);
    if (existsSync(LOG_FILE) && (statSync(LOG_FILE).mode & 63) !== 0)
      chmodSync(LOG_FILE, 384);
  } catch {}
}
function rotatedFiles() {
  if (!existsSync(LOG_DIR))
    return [];
  return readdirSync(LOG_DIR).filter((f) => ROTATED_FILE_RE.test(f)).sort().map((f) => join(LOG_DIR, f));
}
function parseRotatedDate(filename) {
  const match = filename.match(ROTATED_FILE_RE);
  return match ? match[1] : null;
}
function maybeRotate() {
  if (!existsSync(LOG_FILE))
    return;
  const stat = statSync(LOG_FILE);
  if (stat.size < MAX_FILE_SIZE)
    return;
  const date = new Date().toISOString().split("T")[0];
  let rotatedPath = join(LOG_DIR, `telemetry-${date}.jsonl`);
  let counter = 1;
  while (existsSync(rotatedPath)) {
    counter++;
    rotatedPath = join(LOG_DIR, `telemetry-${date}-${counter}.jsonl`);
  }
  renameSync(LOG_FILE, rotatedPath);
  const files = rotatedFiles();
  while (files.length > MAX_ROTATED_FILES) {
    const oldest = files.shift();
    try {
      unlinkSync(oldest);
    } catch {}
  }
}
function recordEvent(event) {
  if (!sessionEnabled)
    return;
  try {
    ensureLogDir();
    tightenLogPermissions();
    maybeRotate();
    const entry = redactEvent({
      ...event,
      timestamp: new Date().toISOString(),
      sessionId
    });
    appendFileSync(LOG_FILE, JSON.stringify(entry) + `
`, { mode: 384 });
  } catch {}
}

class TelemetryReadError extends Error {
  file;
  constructor(file, cause) {
    super(`cannot read telemetry log ${file}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TelemetryReadError";
    this.file = file;
  }
}
var lastSkipped = 0;
function lastReadSkipped() {
  return lastSkipped;
}
function parseLog(file) {
  let content;
  try {
    content = readFileSync(file, "utf-8");
  } catch (err) {
    throw new TelemetryReadError(file, err);
  }
  const events = [];
  let skipped = 0;
  for (const line of content.trim().split(`
`)) {
    if (!line)
      continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      skipped++;
    }
  }
  return { events, skipped };
}
function readEvents(limit = 100) {
  lastSkipped = 0;
  if (!existsSync(LOG_FILE))
    return [];
  if (limit <= 0)
    return [];
  const { events, skipped } = parseLog(LOG_FILE);
  lastSkipped = skipped;
  return events.slice(-limit);
}
function readAllEvents() {
  lastSkipped = 0;
  const events = [];
  const files = existsSync(LOG_FILE) ? [LOG_FILE, ...rotatedFiles()] : rotatedFiles();
  for (const f of files) {
    const parsed = parseLog(f);
    events.push(...parsed.events);
    lastSkipped += parsed.skipped;
  }
  return events;
}
function exportEvents(options) {
  const all = readAllEvents();
  return all.filter((e) => {
    if (options?.from || options?.to) {
      const ts = new Date(e.timestamp).getTime();
      if (options.from && ts < options.from.getTime())
        return false;
      if (options.to && ts > options.to.getTime())
        return false;
    }
    if (options?.sessionId && e.sessionId !== options.sessionId)
      return false;
    return true;
  });
}
function listSessions() {
  const all = readAllEvents();
  const groups = {};
  for (const e of all) {
    if (!groups[e.sessionId])
      groups[e.sessionId] = [];
    groups[e.sessionId].push(e);
  }
  return Object.entries(groups).map(([sid, evts]) => {
    const sorted = evts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstTs = new Date(first.timestamp).getTime();
    const lastTs = new Date(last.timestamp).getTime();
    const errors = sorted.filter((e) => !e.success).length;
    return {
      sessionId: sid,
      eventCount: sorted.length,
      errorRate: Math.round(errors / sorted.length * 1000) / 10,
      firstTimestamp: first.timestamp,
      lastTimestamp: last.timestamp,
      durationMs: lastTs - firstTs
    };
  }).sort((a, b) => new Date(b.firstTimestamp).getTime() - new Date(a.firstTimestamp).getTime());
}
function pruneEvents(olderThanDays = RETENTION_DAYS) {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const f of rotatedFiles()) {
    const basename2 = f.split("/").pop() || "";
    const dateStr = parseRotatedDate(basename2);
    if (!dateStr)
      continue;
    const fileDate = new Date(dateStr + "T00:00:00Z").getTime();
    if (fileDate < cutoff) {
      try {
        unlinkSync(f);
        deleted++;
      } catch {}
    }
  }
  return deleted;
}
function clearEvents() {
  try {
    if (existsSync(LOG_FILE)) {
      writeFileSync(LOG_FILE, "");
    }
    for (const f of rotatedFiles()) {
      try {
        unlinkSync(f);
      } catch {}
    }
  } catch {}
}
function summary() {
  const events = readAllEvents().slice(-1e4);
  const buckets = {};
  for (const e of events) {
    const key = `${e.route}:${e.operation}`;
    if (!buckets[key])
      buckets[key] = { count: 0, success: 0, total_ms: 0 };
    buckets[key].count++;
    if (e.success)
      buckets[key].success++;
    buckets[key].total_ms += e.elapsed_ms;
  }
  const result = {};
  for (const [k, v] of Object.entries(buckets)) {
    result[k] = {
      count: v.count,
      success: v.success,
      avg_ms: Math.round(v.total_ms / v.count)
    };
  }
  return result;
}
function computeHealthFromEvents(events, windowDays) {
  const routeDistribution = {};
  for (const e of events) {
    const r = routeDistribution[e.route] || (routeDistribution[e.route] = { count: 0, success: 0 });
    r.count++;
    if (e.success)
      r.success++;
  }
  const fallbackFrequency = {};
  for (const e of events) {
    if (e.fallback_reason) {
      fallbackFrequency[e.fallback_reason] = (fallbackFrequency[e.fallback_reason] || 0) + 1;
    }
  }
  const replaceHashEvents = events.filter((e) => e.operation === "replace-hash");
  const staleAnchors = {
    total: replaceHashEvents.filter((e) => (e.retries ?? 0) > 0 || e.fallback_reason === "stale-anchor").length,
    recovered: replaceHashEvents.filter((e) => (e.retries ?? 0) > 0).length,
    failed: replaceHashEvents.filter((e) => e.fallback_reason === "stale-anchor" && !e.success).length
  };
  const perLanguage = {};
  for (const e of events) {
    if (e.language) {
      const l = perLanguage[e.language] || (perLanguage[e.language] = { operations: 0, failures: 0 });
      l.operations++;
      if (!e.success)
        l.failures++;
    }
  }
  const verifyEvents = events.filter((e) => e.operation === "verify-changes");
  const verifyFailures = { total: 0, byCheck: {} };
  for (const e of verifyEvents) {
    if (!e.success)
      verifyFailures.total++;
    if (e.failed_in) {
      for (const check of e.failed_in) {
        verifyFailures.byCheck[check] = (verifyFailures.byCheck[check] || 0) + 1;
      }
    }
  }
  return {
    totalEvents: events.length,
    windowDays,
    routeDistribution,
    fallbackFrequency,
    staleAnchors,
    perLanguage,
    verifyFailures
  };
}
function health(windowDays = 7) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const events = readAllEvents().filter((e) => {
    return new Date(e.timestamp).getTime() >= cutoff;
  });
  const base = computeHealthFromEvents(events, windowDays);
  const { routeDistribution, staleAnchors, perLanguage, verifyFailures } = base;
  const replaceHashCount = events.filter((e) => e.operation === "replace-hash").length;
  const verifyEventCount = events.filter((e) => e.operation === "verify-changes").length;
  const verifyFailCount = verifyFailures.total;
  const fc = {};
  for (const e of events) {
    if (e.fallback_reason)
      fc[e.fallback_reason] = (fc[e.fallback_reason] || 0) + 1;
  }
  const topFallbackCauses = Object.entries(fc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([reason, count]) => ({ reason, count }));
  const warnings = [];
  if (replaceHashCount > 0) {
    const staleRate = staleAnchors.total / replaceHashCount;
    if (staleRate > 0.1) {
      warnings.push(`Stale-anchor rate ${(staleRate * 100).toFixed(0)}% exceeds threshold of 10% (${staleAnchors.total}/${replaceHashCount} replace-hash calls)`);
    }
  }
  const diffCount = routeDistribution["diff"]?.count ?? 0;
  if (events.length > 0 && diffCount / events.length > 0.1) {
    warnings.push(`Fallback-to-diff rate ${(diffCount / events.length * 100).toFixed(0)}% exceeds threshold of 10%`);
  }
  if (verifyEventCount > 0) {
    const verifyFailRate = verifyFailCount / verifyEventCount;
    if (verifyFailRate > 0.2) {
      warnings.push(`Verify-changes failure rate ${(verifyFailRate * 100).toFixed(0)}% exceeds threshold of 20% (${verifyFailCount}/${verifyEventCount})`);
    }
  }
  for (const [lang, stats] of Object.entries(perLanguage)) {
    if (stats.operations >= 3 && stats.failures / stats.operations > 0.3) {
      warnings.push(`Language '${lang}' failure rate ${(stats.failures / stats.operations * 100).toFixed(0)}% exceeds threshold of 30% (${stats.failures}/${stats.operations})`);
    }
  }
  return {
    ...base,
    topFallbackCauses,
    warnings
  };
}
function healthTrend(windowDays = 7) {
  const current = health(windowDays);
  const previous = healthFromWindow(windowDays * 2, windowDays);
  const changes = compareHealth(current, previous);
  return { current, previous, changes };
}
function healthFromWindow(pastDays, offsetDays) {
  const now = Date.now();
  const windowEnd = now - offsetDays * 24 * 60 * 60 * 1000;
  const windowStart = now - pastDays * 24 * 60 * 60 * 1000;
  const events = readAllEvents().filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    return ts >= windowStart && ts < windowEnd;
  });
  const base = computeHealthFromEvents(events, pastDays);
  return {
    ...base,
    topFallbackCauses: [],
    warnings: []
  };
}
function compareHealth(current, previous) {
  const newWarnings = [];
  const resolvedWarnings = [];
  const currentWarnSet = new Set(current.warnings);
  const prevWarnSet = new Set(previous.warnings);
  for (const w of current.warnings) {
    if (!prevWarnSet.has(w))
      newWarnings.push(w);
  }
  for (const w of previous.warnings) {
    if (!currentWarnSet.has(w))
      resolvedWarnings.push(w);
  }
  const curTotal = current.totalEvents || 1;
  const prevTotal = previous.totalEvents || 1;
  const curErrors = current.totalEvents - Object.values(current.routeDistribution).reduce((s, r) => s + r.success, 0);
  const prevErrors = previous.totalEvents - Object.values(previous.routeDistribution).reduce((s, r) => s + r.success, 0);
  const errorRateDelta = (curErrors / curTotal - prevErrors / prevTotal) * 100;
  const staleAnchorDelta = current.staleAnchors.total - previous.staleAnchors.total;
  const curVerifyOps = current.routeDistribution["verify"]?.count || 1;
  const curVerifyRate = current.verifyFailures.total / curVerifyOps;
  const prevVerifyOps = previous.routeDistribution["verify"]?.count || 1;
  const prevVerifyRate = previous.verifyFailures.total / prevVerifyOps;
  const verifyFailureDelta = (curVerifyRate - prevVerifyRate) * 100;
  const languageRegressions = [];
  for (const [lang, curStats] of Object.entries(current.perLanguage)) {
    const prevStats = previous.perLanguage[lang];
    if (prevStats) {
      const curFailRate = curStats.failures / Math.max(1, curStats.operations);
      const prevFailRate = prevStats.failures / Math.max(1, prevStats.operations);
      if (curFailRate > prevFailRate && curFailRate > 0.1) {
        languageRegressions.push(`${lang} (${(prevFailRate * 100).toFixed(0)}% → ${(curFailRate * 100).toFixed(0)}% failure rate)`);
      }
    }
  }
  return {
    totalEventsDelta: current.totalEvents - previous.totalEvents,
    errorRateDelta: Math.round(errorRateDelta * 10) / 10,
    staleAnchorDelta,
    verifyFailureDelta: Math.round(verifyFailureDelta * 10) / 10,
    newWarnings,
    resolvedWarnings,
    languageRegressions
  };
}

// src/core/exit-codes.ts
var ERROR_CODE_EXITS = {
  ["STALE_ANCHOR" /* STALE_ANCHOR */]: 3 /* PRECONDITION */,
  ["HASH_MISMATCH" /* HASH_MISMATCH */]: 3 /* PRECONDITION */,
  ["FILE_NOT_FOUND" /* FILE_NOT_FOUND */]: 5 /* IO */,
  ["WRITE_FAILED" /* WRITE_FAILED */]: 5 /* IO */,
  ["READ_FAILED" /* READ_FAILED */]: 5 /* IO */,
  ["PATH_DENIED" /* PATH_DENIED */]: 1 /* USAGE */,
  ["INVALID_ARGUMENT" /* INVALID_ARGUMENT */]: 1 /* USAGE */,
  ["UNSUPPORTED_OPERATION" /* UNSUPPORTED_OPERATION */]: 1 /* USAGE */,
  ["SYMBOL_NOT_FOUND" /* SYMBOL_NOT_FOUND */]: 2 /* EDIT_FAILED */,
  ["PARSE_ERROR" /* PARSE_ERROR */]: 2 /* EDIT_FAILED */,
  ["DUPLICATE_MATCH" /* DUPLICATE_MATCH */]: 2 /* EDIT_FAILED */,
  ["UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */]: 2 /* EDIT_FAILED */,
  ["VERIFY_FAILED" /* VERIFY_FAILED */]: 4 /* VERIFY_FAILED */
};
function exitCodeFor(result) {
  if (result === undefined)
    return 0 /* OK */;
  if (Array.isArray(result)) {
    return result.reduce((worst, r) => {
      const code = exitCodeFor(r);
      return code > worst ? code : worst;
    }, 0 /* OK */);
  }
  if (result.success === undefined && result.passed === undefined && result.error === undefined && result.result && typeof result.result === "object") {
    return exitCodeFor(result.result);
  }
  const explicit = result.errorCode ?? (typeof result.error === "object" ? result.error?.code : undefined);
  if (explicit && ERROR_CODE_EXITS[explicit])
    return ERROR_CODE_EXITS[explicit];
  const failed = result.success === false || result.passed === false || result.error !== undefined && result.error !== null;
  if (!failed)
    return 0 /* OK */;
  if (result.stale === true)
    return 3 /* PRECONDITION */;
  return 2 /* EDIT_FAILED */;
}
function finish(payload, code) {
  const exit = code ?? exitCodeFor(payload);
  console.log(JSON.stringify(wrap(payload, exit), null, 2));
  process.exitCode = exit;
}
function usageError(message, extra = {}) {
  finish({ success: false, errorCode: "INVALID_ARGUMENT" /* INVALID_ARGUMENT */, message, ...extra }, 1 /* USAGE */);
}

// src/core/envelope.ts
var API_VERSION = "1";
var currentCommand = "";
var warnings = [];
function setCommand(name) {
  currentCommand = name;
  warnings = [];
}
function addWarning(warning) {
  warnings.push(warning);
}
function takeWarnings() {
  const taken = warnings;
  warnings = [];
  return taken;
}
function firstFailure(payload) {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = firstFailure(item);
      if (found)
        return found;
    }
    return;
  }
  if (!payload || typeof payload !== "object")
    return;
  const p = payload;
  const failed = p.success === false || p.passed === false || p.error !== undefined && p.error !== null;
  if (failed)
    return p;
  return p.result ? firstFailure(p.result) : undefined;
}
function messageOf(p) {
  if (typeof p.message === "string" && p.message)
    return p.message;
  if (typeof p.error === "string" && p.error)
    return p.error;
  if (p.error && typeof p.error === "object") {
    const nested = p.error.message;
    if (nested)
      return nested;
  }
  return "Operation failed.";
}
function codeOf(p) {
  if (p.errorCode)
    return p.errorCode;
  if (p.error && typeof p.error === "object") {
    const nested = p.error.code;
    if (nested)
      return nested;
  }
  return "UNKNOWN" /* UNKNOWN */;
}
function wrap(payload, code, command = currentCommand) {
  const failure = code === 0 /* OK */ ? undefined : firstFailure(payload);
  const error = code === 0 /* OK */ ? null : failure ? {
    code: codeOf(failure),
    message: messageOf(failure),
    ...failure.recovery ? { recovery: failure.recovery } : {}
  } : { code: "UNKNOWN" /* UNKNOWN */, message: "Operation failed." };
  return {
    apiVersion: API_VERSION,
    ok: code === 0 /* OK */,
    command,
    data: payload ?? null,
    error,
    warnings: takeWarnings()
  };
}

// src/core/paths.ts
import {
  existsSync as existsSync3,
  realpathSync,
  writeFileSync as writeFileSync3,
  renameSync as renameSync3,
  unlinkSync as unlinkSync3,
  statSync as statSync3,
  openSync,
  fsyncSync,
  closeSync
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join as join3, relative, resolve, sep } from "node:path";

// src/core/snapshot.ts
import {
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync2,
  writeFileSync as writeFileSync2,
  appendFileSync as appendFileSync2,
  readdirSync as readdirSync2,
  statSync as statSync2,
  unlinkSync as unlinkSync2,
  renameSync as renameSync2
} from "node:fs";
import { join as join2 } from "node:path";
import { createHash as createHash2 } from "node:crypto";
function root() {
  return join2(process.env.HOME || "/root", ".agentic-tools", "snapshots");
}
function objectsDir() {
  return join2(root(), "objects");
}
function indexFile() {
  return join2(root(), "index.jsonl");
}
var DEFAULT_RETENTION = { maxChangeSets: 200, maxAgeDays: 7 };
var retention = { ...DEFAULT_RETENTION };
var enabled = true;
var currentChangeSet = null;
function configureSnapshots(options = {}) {
  if (options.enabled !== undefined)
    enabled = options.enabled;
  if (options.maxChangeSets !== undefined)
    retention.maxChangeSets = options.maxChangeSets;
  if (options.maxAgeDays !== undefined)
    retention.maxAgeDays = options.maxAgeDays;
}
function setCurrentChangeSet(id2) {
  currentChangeSet = id2;
}
function sha256(content) {
  return createHash2("sha256").update(content).digest("hex");
}
function ensureDirs() {
  if (!existsSync2(objectsDir()))
    mkdirSync2(objectsDir(), { recursive: true, mode: 448 });
}
function recordSnapshot(file, newContent) {
  if (!enabled || !currentChangeSet)
    return;
  try {
    ensureDirs();
    let beforeHash = null;
    if (existsSync2(file)) {
      const original = readFileSync2(file);
      beforeHash = sha256(original);
      const objectPath = join2(objectsDir(), beforeHash);
      if (!existsSync2(objectPath))
        writeFileSync2(objectPath, original, { mode: 384 });
    }
    const record = {
      changeSetId: currentChangeSet,
      timestamp: new Date().toISOString(),
      file,
      beforeHash,
      afterHash: sha256(newContent)
    };
    appendFileSync2(indexFile(), JSON.stringify(record) + `
`, { mode: 384 });
  } catch {}
}
function readIndex() {
  if (!existsSync2(indexFile()))
    return [];
  return readFileSync2(indexFile(), "utf8").split(`
`).filter((l) => l.trim().length > 0).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter((r) => r !== null);
}
function listChangeSets(limit = 20) {
  const byId = new Map;
  const order = new Map;
  for (const r of readIndex()) {
    if (!order.has(r.changeSetId))
      order.set(r.changeSetId, order.size);
    const existing = byId.get(r.changeSetId);
    if (existing) {
      if (!existing.files.includes(r.file))
        existing.files.push(r.file);
      if (r.timestamp > existing.timestamp)
        existing.timestamp = r.timestamp;
    } else {
      byId.set(r.changeSetId, { changeSetId: r.changeSetId, timestamp: r.timestamp, files: [r.file] });
    }
  }
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp) || order.get(b.changeSetId) - order.get(a.changeSetId)).slice(0, limit);
}
function lastChangeSetId() {
  return listChangeSets(1)[0]?.changeSetId ?? null;
}
function undoChangeSet(changeSetId, options = {}) {
  const records = readIndex().filter((r) => r.changeSetId === changeSetId);
  if (records.length === 0) {
    return {
      success: false,
      changeSetId,
      files: [],
      message: `No snapshots recorded for changeSet ${changeSetId}.`,
      errorCode: "FILE_NOT_FOUND"
    };
  }
  const firstPerFile = new Map;
  const lastPerFile = new Map;
  for (const r of records) {
    if (!firstPerFile.has(r.file))
      firstPerFile.set(r.file, r);
    lastPerFile.set(r.file, r);
  }
  const files = [];
  for (const [file, first] of firstPerFile) {
    const last = lastPerFile.get(file);
    const exists = existsSync2(file);
    if (exists) {
      const current = sha256(readFileSync2(file));
      if (current !== last.afterHash && !options.force) {
        files.push({
          file,
          restored: false,
          reason: "modified since the edit was applied; pass --force to restore anyway"
        });
        continue;
      }
    }
    if (first.beforeHash === null) {
      if (!options.dryRun && exists) {
        try {
          unlinkSync2(file);
        } catch (e) {
          files.push({ file, restored: false, reason: `could not remove: ${e.message}` });
          continue;
        }
      }
      files.push({ file, restored: true, reason: "created by this changeSet; removed" });
      continue;
    }
    const objectPath = join2(objectsDir(), first.beforeHash);
    if (!existsSync2(objectPath)) {
      files.push({ file, restored: false, reason: "snapshot object was pruned; nothing to restore from" });
      continue;
    }
    if (!options.dryRun) {
      try {
        atomicWriteSync(file, readFileSync2(objectPath));
      } catch (e) {
        files.push({ file, restored: false, reason: `restore failed: ${e.message}` });
        continue;
      }
    }
    files.push({ file, restored: true });
  }
  const failed = files.filter((f) => !f.restored);
  return {
    success: failed.length === 0,
    changeSetId,
    files,
    errorCode: failed.length ? "HASH_MISMATCH" : undefined,
    message: failed.length ? `Restored ${files.length - failed.length}/${files.length} file(s); ${failed.length} refused.` : `Restored ${files.length} file(s) from changeSet ${changeSetId}.`
  };
}
function atomicWriteSync(target, content) {
  const dir = join2(target, "..");
  const tmp = join2(dir, `.hashpilot-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  let mode = 420;
  try {
    mode = statSync2(target).mode & 511;
  } catch {}
  writeFileSync2(tmp, content, { mode });
  try {
    renameSync2(tmp, target);
  } catch (e) {
    try {
      unlinkSync2(tmp);
    } catch {}
    throw e;
  }
}
function pruneSnapshots(now = Date.now()) {
  if (!existsSync2(indexFile()))
    return { changeSetsRemoved: 0, objectsRemoved: 0 };
  const records = readIndex();
  const sets = listChangeSets(Number.MAX_SAFE_INTEGER);
  const cutoff = now - retention.maxAgeDays * 24 * 60 * 60 * 1000;
  const keep = new Set(sets.filter((s, i) => i < retention.maxChangeSets && Date.parse(s.timestamp) >= cutoff).map((s) => s.changeSetId));
  const changeSetsRemoved = sets.length - keep.size;
  if (changeSetsRemoved === 0)
    return { changeSetsRemoved: 0, objectsRemoved: 0 };
  const kept = records.filter((r) => keep.has(r.changeSetId));
  writeFileSync2(indexFile(), kept.map((r) => JSON.stringify(r)).join(`
`) + (kept.length ? `
` : ""), { mode: 384 });
  const live = new Set(kept.map((r) => r.beforeHash).filter((h) => h !== null));
  let objectsRemoved = 0;
  if (existsSync2(objectsDir())) {
    for (const name of readdirSync2(objectsDir())) {
      if (live.has(name))
        continue;
      try {
        unlinkSync2(join2(objectsDir(), name));
        objectsRemoved++;
      } catch {}
    }
  }
  return { changeSetsRemoved, objectsRemoved };
}
function cleanOrphanTempFiles(dir, maxAgeMs = 60 * 60 * 1000, now = Date.now()) {
  let removed = 0;
  try {
    for (const name of readdirSync2(dir)) {
      if (!name.startsWith(".hashpilot-tmp-"))
        continue;
      const p = join2(dir, name);
      try {
        if (now - statSync2(p).mtimeMs < maxAgeMs)
          continue;
        unlinkSync2(p);
        removed++;
      } catch {}
    }
  } catch {}
  return removed;
}

// src/core/paths.ts
class PathDeniedError extends Error {
  errorCode = "PATH_DENIED" /* PATH_DENIED */;
  path;
  reason;
  constructor(path, reason) {
    super(`Refusing to write ${path}: ${reason}`);
    this.name = "PathDeniedError";
    this.path = path;
    this.reason = reason;
  }
}
var boundaryDefaults = {};
function configureWriteBoundary(options) {
  boundaryDefaults = { ...boundaryDefaults, ...options };
}
var CASE_INSENSITIVE = platform() === "darwin" || platform() === "win32";
function normalizeForCompare(p) {
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}
function isInside(child, parent) {
  const c = normalizeForCompare(child);
  const p = normalizeForCompare(parent);
  if (c === p)
    return true;
  const rel = relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function hardDenyTargets() {
  const home = homedir();
  return {
    dirs: [
      join3(home, ".ssh"),
      join3(home, ".aws"),
      join3(home, ".gnupg"),
      join3(home, ".claude"),
      join3(home, ".config", "hashpilot"),
      join3(home, ".agentic-tools"),
      "/etc"
    ],
    files: [
      ".bashrc",
      ".bash_profile",
      ".bash_login",
      ".profile",
      ".zshrc",
      ".zshenv",
      ".zprofile",
      ".zlogin",
      ".netrc",
      ".npmrc",
      ".gitconfig"
    ].map((f) => join3(home, f))
  };
}
function resolveThroughSymlinks(target) {
  const abs = resolve(target);
  let existing = abs;
  const trailing = [];
  while (!existsSync3(existing)) {
    const parent = dirname(existing);
    if (parent === existing)
      return abs;
    trailing.unshift(existing.slice(parent.length + 1));
    existing = parent;
  }
  try {
    return trailing.length ? join3(realpathSync(existing), ...trailing) : realpathSync(existing);
  } catch {
    return abs;
  }
}
function findProjectRoot(cwd = process.cwd()) {
  let dir = resolveThroughSymlinks(cwd);
  while (true) {
    if (existsSync3(join3(dir, ".git")))
      return dir;
    const parent = dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return resolveThroughSymlinks(cwd);
}
function assertWritable(target, options = {}) {
  const { cwd = process.cwd(), allowedRoots = [], allowOutsideRoot = false, quiet = false } = {
    ...boundaryDefaults,
    ...options
  };
  if (!target || target.trim() === "") {
    throw new PathDeniedError(String(target), "empty path");
  }
  if (target.includes("\x00")) {
    throw new PathDeniedError(target, "path contains a null byte");
  }
  const resolved = resolveThroughSymlinks(target);
  const { dirs, files } = hardDenyTargets();
  for (const rawDir of dirs) {
    const dir = resolveThroughSymlinks(rawDir);
    if (isInside(resolved, dir)) {
      throw new PathDeniedError(resolved, `${dir} is never writable by HashPilot`);
    }
  }
  for (const rawFile of files) {
    const file = resolveThroughSymlinks(rawFile);
    if (normalizeForCompare(resolved) === normalizeForCompare(file)) {
      throw new PathDeniedError(resolved, "shell and tool configuration files are never writable by HashPilot");
    }
  }
  if (allowOutsideRoot) {
    if (!quiet) {
      console.error(`WARNING: --allow-outside-root is set; writing outside the project root to ${resolved}`);
    }
    return resolved;
  }
  const roots = [findProjectRoot(cwd), ...allowedRoots.map((r) => resolveThroughSymlinks(resolve(cwd, r)))];
  if (roots.some((root2) => isInside(resolved, root2)))
    return resolved;
  throw new PathDeniedError(resolved, `outside the project root (${roots[0]}). Pass --allow-outside-root or add the location to "allowedRoots" in .hashpilot.json`);
}
async function safeWrite(target, content, options = {}) {
  const resolved = assertWritable(target, options);
  recordSnapshot(resolved, content);
  atomicWrite(resolved, content);
  return resolved;
}
var crashAfterTempWrite = false;
function atomicWrite(resolved, content) {
  const dir = dirname(resolved);
  const tmp = join3(dir, `.hashpilot-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  let mode = 420;
  try {
    if (existsSync3(resolved))
      mode = statSync3(resolved).mode & 511;
  } catch {}
  let fd;
  try {
    writeFileSync3(tmp, content, { mode });
    fd = openSync(tmp, "r+");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (crashAfterTempWrite)
      throw new Error("simulated crash after temp write");
    renameSync3(tmp, resolved);
  } catch (err) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {}
    }
    try {
      unlinkSync3(tmp);
    } catch {}
    throw err;
  }
  try {
    const dirFd = openSync(dir, "r");
    fsyncSync(dirFd);
    closeSync(dirFd);
  } catch {}
  cleanOrphanTempFiles(dir);
}

// src/core/ast-edit.ts
var import_tree_sitter = __toESM(require_tree_sitter(), 1);
var import_tree_sitter_typescript = __toESM(require_node(), 1);
var import_tree_sitter_python = __toESM(require_node2(), 1);
var import_tree_sitter_javascript = __toESM(require_node3(), 1);
var import_tree_sitter_go = __toESM(require_node4(), 1);
var import_tree_sitter_rust = __toESM(require_node5(), 1);
var SUPPORTED_LANGUAGES = {};
var EXTENSION_MAP = [
  [".d.ts", "__typescript_decl__"],
  [".tsx", "tsx"],
  [".ts", "typescript"],
  [".jsx", "javascript"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"]
];
function getParser(lang) {
  if (SUPPORTED_LANGUAGES[lang])
    return SUPPORTED_LANGUAGES[lang].parser;
  try {
    const p = new import_tree_sitter.default;
    switch (lang) {
      case "typescript":
        p.setLanguage(import_tree_sitter_typescript.default.typescript);
        break;
      case "tsx":
        p.setLanguage(import_tree_sitter_typescript.default.tsx);
        break;
      case "javascript":
        p.setLanguage(import_tree_sitter_javascript.default);
        break;
      case "python":
        p.setLanguage(import_tree_sitter_python.default);
        break;
      case "go":
        p.setLanguage(import_tree_sitter_go.default);
        break;
      case "rust":
        p.setLanguage(import_tree_sitter_rust.default);
        break;
      default:
        return null;
    }
    SUPPORTED_LANGUAGES[lang] = { parser: p, extensions: [] };
    return p;
  } catch (e) {
    return null;
  }
}
var PARSE_CHUNK = 16 * 1024;
function parseSource(parser, source) {
  return parser.parse((index) => {
    if (index >= source.length)
      return null;
    let end = Math.min(index + PARSE_CHUNK, source.length);
    const last = source.charCodeAt(end - 1);
    if (end < source.length && last >= 55296 && last <= 56319)
      end -= 1;
    return source.slice(index, end);
  });
}
function detectLanguage(filePath) {
  for (const [ext, lang] of EXTENSION_MAP) {
    if (filePath.endsWith(ext)) {
      if (lang === "__typescript_decl__")
        return null;
      return lang;
    }
  }
  return null;
}
function isLanguageSupported(filePath) {
  return detectLanguage(filePath) !== null;
}
function astCapabilities() {
  return [
    {
      lang: "typescript",
      extensions: [".ts"],
      operations: ALL_AST_OPS,
      limitations: [".d.ts files are excluded"]
    },
    {
      lang: "tsx",
      extensions: [".tsx"],
      operations: ALL_AST_OPS,
      limitations: []
    },
    {
      lang: "javascript",
      extensions: [".js", ".jsx", ".mjs", ".cjs"],
      operations: ALL_AST_OPS,
      limitations: []
    },
    {
      lang: "python",
      extensions: [".py"],
      operations: ALL_AST_OPS,
      limitations: [
        "add-import supports `import X`, `from X import Y`, and `from X import Y, Z`; auto-merges into existing from-import for the same module"
      ]
    },
    {
      lang: "go",
      extensions: [".go"],
      operations: ALL_AST_OPS,
      limitations: [
        "add-import: with no existing imports inserts after `package` clause; with grouped `import ( ... )` block inserts inside the group"
      ]
    },
    {
      lang: "rust",
      extensions: [".rs"],
      operations: ALL_AST_OPS,
      limitations: [
        "remove-import: grouped `use X::{Y, Z}` supports surgical per-item removal; last item simplifies to `use X::Y`; no substring false positives"
      ]
    }
  ];
}
var ALL_AST_OPS = [
  "find-symbols",
  "rename-symbol",
  "replace-body",
  "add-import",
  "remove-import",
  "insert-before",
  "insert-after"
];
var LANG_CONFIGS = {
  typescript: {
    symbolKinds: [
      "function_declaration",
      "method_definition",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "variable_declarator"
    ],
    functionTypes: ["function_declaration", "method_definition", "arrow_function"]
  },
  tsx: {
    symbolKinds: [
      "function_declaration",
      "method_definition",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "variable_declarator"
    ],
    functionTypes: ["function_declaration", "method_definition", "arrow_function"]
  },
  javascript: {
    symbolKinds: [
      "function_declaration",
      "method_definition",
      "class_declaration",
      "variable_declarator"
    ],
    functionTypes: ["function_declaration", "method_definition", "arrow_function"]
  },
  python: {
    symbolKinds: ["function_definition", "class_definition"],
    functionTypes: ["function_definition"]
  },
  go: {
    symbolKinds: ["function_declaration", "method_declaration", "type_spec", "var_spec"],
    functionTypes: ["function_declaration", "method_declaration"]
  },
  rust: {
    symbolKinds: [
      "function_item",
      "struct_item",
      "enum_item",
      "trait_item",
      "type_item",
      "const_item",
      "static_item"
    ],
    functionTypes: ["function_item"]
  }
};
function configFor(lang) {
  return LANG_CONFIGS[lang] ?? null;
}
var IDENTIFIER_TYPES = new Set(["identifier", "type_identifier", "property_identifier"]);
function findSymbols(source, filePath) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return [];
  const cfg = configFor(lang);
  if (!cfg)
    return [];
  const parser = getParser(lang);
  if (!parser)
    return [];
  const tree = parseSource(parser, source);
  const symbols = [];
  function walk(node, depth = 0) {
    if (depth > 10)
      return;
    if (cfg.symbolKinds.includes(node.type)) {
      const nameNode = node.childForFieldName("name") || node.children.find((c) => IDENTIFIER_TYPES.has(c.type));
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          kind: node.type,
          startRow: node.startPosition.row,
          endRow: node.endPosition.row,
          startCol: node.startPosition.column,
          endCol: node.endPosition.column
        });
      }
    }
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
  walk(tree.rootNode);
  return symbols;
}
function renameSymbolUnchecked(source, filePath, oldName, newName) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: "Unsupported language", error: `Language not supported for file: ${filePath}` };
  const parser = getParser(lang);
  if (!parser)
    return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const tree = parseSource(parser, source);
  let changes = 0;
  const edits = [];
  function findRefs(node) {
    if ((node.type === "identifier" || node.type === "type_identifier") && node.text === oldName) {
      edits.push({ start: node.startIndex, end: node.endIndex, text: newName });
      changes++;
    }
    for (const child of node.children)
      findRefs(child);
  }
  findRefs(tree.rootNode);
  if (changes === 0)
    return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: `Symbol '${oldName}' not found`, errorCode: "SYMBOL_NOT_FOUND" /* SYMBOL_NOT_FOUND */ };
  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    newSource = newSource.slice(0, e.start) + e.text + newSource.slice(e.end);
  }
  return { success: true, path: filePath, operation: "rename-symbol", changes, message: `Renamed ${changes} occurrences of '${oldName}' to '${newName}'`, newSource };
}
function replaceBodyUnchecked(source, filePath, symbolName, newBody) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const cfg = configFor(lang);
  if (!cfg)
    return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const parser = getParser(lang);
  if (!parser)
    return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const tree = parseSource(parser, source);
  const edits = [];
  let changes = 0;
  function findAndReplace(node) {
    if (cfg.functionTypes.includes(node.type)) {
      const nameNode = node.childForFieldName("name");
      if (nameNode && nameNode.text === symbolName) {
        const bodyNode = node.childForFieldName("body");
        if (bodyNode) {
          const declLineStart = source.lastIndexOf(`
`, node.startIndex) + 1;
          const outerIndent = source.slice(declLineStart, node.startIndex).match(/^\s*/)?.[0] ?? "";
          const indent = outerIndent + "  ";
          const indentedBody = newBody.split(`
`).map((l) => l.length ? indent + l : l).join(`
`);
          const open = bodyNode.firstChild;
          const close = bodyNode.lastChild;
          const braced = open?.text === "{" && close?.text === "}" && open !== close;
          if (braced) {
            edits.push({
              start: open.endIndex,
              end: close.startIndex,
              text: `
${indentedBody}
${outerIndent}`
            });
          } else {
            edits.push({ start: bodyNode.startIndex, end: bodyNode.endIndex, text: indentedBody.trimStart() });
          }
          changes++;
          return true;
        }
      }
    }
    for (const child of node.children) {
      if (findAndReplace(child))
        return true;
    }
    return false;
  }
  findAndReplace(tree.rootNode);
  if (changes === 0)
    return { success: false, path: filePath, operation: "replace-body", changes: 0, message: `Symbol '${symbolName}' not found or has no body`, errorCode: "SYMBOL_NOT_FOUND" /* SYMBOL_NOT_FOUND */ };
  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    newSource = newSource.slice(0, e.start) + e.text + newSource.slice(e.end);
  }
  return { success: true, path: filePath, operation: "replace-body", changes, message: `Replaced body of '${symbolName}'`, newSource };
}
var IMPORT_CONFIGS = {
  typescript: { nodeTypes: ["import_statement"], lineTemplate: `import {spec};
` },
  tsx: { nodeTypes: ["import_statement"], lineTemplate: `import {spec};
` },
  javascript: { nodeTypes: ["import_statement"], lineTemplate: `import {spec};
` },
  python: {
    nodeTypes: ["import_statement", "import_from_statement"],
    lineTemplate: `{spec}
`,
    transformSpec: (s) => s.startsWith("import ") || s.startsWith("from ") ? s : "import " + s
  },
  go: {
    nodeTypes: ["import_declaration"],
    lineTemplate: `import "{spec}"
`,
    fallbackInsert: (root2) => {
      function findPkg(n2) {
        if (n2.type === "package_clause")
          return n2.endIndex;
        for (let i = 0;i < n2.childCount; i++) {
          const r = findPkg(n2.child(i));
          if (r !== null)
            return r;
        }
        return null;
      }
      return findPkg(root2);
    },
    groupedInsert: (source, root2, newImportLine) => {
      let grouped = null;
      function findLastGrouped(n2) {
        if (n2.type === "import_declaration") {
          for (let i = 0;i < n2.childCount; i++) {
            if (n2.child(i).type === "import_spec_list") {
              grouped = n2;
              break;
            }
          }
        }
        for (let i = 0;i < n2.childCount; i++)
          findLastGrouped(n2.child(i));
      }
      findLastGrouped(root2);
      if (!grouped)
        return null;
      for (let i = 0;i < grouped.childCount; i++) {
        if (grouped.child(i).type === "import_spec_list") {
          const specList = grouped.child(i);
          const closeParen = specList.child(specList.childCount - 1);
          if (closeParen && closeParen.type === ")") {
            const specContent = newImportLine.replace(/^import\s+/, "").replace(/;\s*$/, `
`);
            const insertContent = "\t" + specContent;
            const insertAt = closeParen.startIndex;
            return source.slice(0, insertAt) + insertContent + source.slice(insertAt);
          }
        }
      }
      return null;
    }
  },
  rust: { nodeTypes: ["use_declaration"], lineTemplate: `use {spec};
` }
};
function addImportUnchecked(source, filePath, importSpec) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const icfg = IMPORT_CONFIGS[lang];
  if (!icfg)
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const parser = getParser(lang);
  if (!parser)
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const dedupPattern = new RegExp(`(import|from|use).*${escapeRegex(importSpec)}`);
  if (dedupPattern.test(source)) {
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: `Import for '${importSpec}' already exists` };
  }
  const tree = parseSource(parser, source);
  let lastImportEnd = 0;
  function findLastImport(node) {
    if (icfg.nodeTypes.includes(node.type))
      lastImportEnd = Math.max(lastImportEnd, node.endIndex);
    for (const child of node.children)
      findLastImport(child);
  }
  findLastImport(tree.rootNode);
  const resolvedSpec = icfg.transformSpec ? icfg.transformSpec(importSpec) : importSpec;
  const newImportLine = icfg.lineTemplate.replace("{spec}", resolvedSpec);
  if (lang === "python" && importSpec.startsWith("from ")) {
    const parsed = parsePythonFromImport(importSpec, source, tree);
    if (parsed) {
      return parsed;
    }
  }
  let newSource;
  if (lastImportEnd > 0) {
    const groupedResult = icfg.groupedInsert?.(source, tree.rootNode, newImportLine) ?? null;
    if (groupedResult !== null) {
      newSource = groupedResult;
    } else {
      let insertPos = lastImportEnd;
      while (source[insertPos] === `
`)
        insertPos++;
      newSource = source.slice(0, insertPos) + `
` + newImportLine + source.slice(insertPos);
    }
  } else if (icfg.fallbackInsert) {
    const pos = icfg.fallbackInsert(tree.rootNode);
    if (pos !== null && pos > 0) {
      const restAfterPos = source.slice(pos);
      newSource = source.slice(0, pos) + `

` + newImportLine + restAfterPos.replace(/^\n+/, "");
    } else {
      newSource = newImportLine + source;
    }
  } else {
    newSource = newImportLine + source;
  }
  return { success: true, path: filePath, operation: "add-import", changes: 1, message: `Added import: ${importSpec}`, newSource };
}
function removeImportUnchecked(source, filePath, importSpec) {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  }
  const parser = getParser(lang);
  if (!parser) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  }
  const tree = parseSource(parser, source);
  const icfg = IMPORT_CONFIGS[lang];
  if (lang === "rust") {
    return removeRustImport(source, tree, filePath, importSpec);
  }
  const removals = [];
  function collectRemovals(node) {
    if (icfg && icfg.nodeTypes.includes(node.type) && node.text.includes(importSpec)) {
      removals.push({ start: node.startIndex, end: node.endIndex });
      return;
    }
    for (let i = 0;i < node.childCount; i++) {
      collectRemovals(node.child(i));
    }
  }
  collectRemovals(tree.rootNode);
  if (removals.length === 0) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: `No import for '${importSpec}' found` };
  }
  removals.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const r of removals) {
    let end = r.end;
    while (end < newSource.length && newSource[end] === `
`)
      end++;
    newSource = newSource.slice(0, r.start) + newSource.slice(end);
  }
  return { success: true, path: filePath, operation: "remove-import", changes: removals.length, message: `Removed ${removals.length} import(s) for '${importSpec}'`, newSource };
}
function removeRustImport(source, tree, filePath, importSpec) {
  const changes = [];
  let changeCount = 0;
  function walk(node) {
    if (node.type !== "use_declaration") {
      for (let i = 0;i < node.childCount; i++)
        walk(node.child(i));
      return;
    }
    const scopeList = findChildByType(node, "scoped_use_list");
    if (scopeList) {
      const useList = findChildByType(scopeList, "use_list");
      if (useList) {
        const matched = findUseListMatches(useList, importSpec);
        if (matched.length === 0)
          return;
        const nonMatched = getUseListItems(useList).filter((it) => !matched.has(it));
        changeCount += matched.size;
        if (nonMatched.length === 0) {
          changes.push({ start: node.startIndex, end: node.endIndex });
        } else if (nonMatched.length === 1) {
          const pathBeforeBraces = source.slice(scopeList.startIndex, useList.startIndex);
          const pathStr = pathBeforeBraces.replace(/::\s*$/, "").trim();
          const replacement = `use ${pathStr}::${nonMatched[0].text};`;
          changes.push({ start: node.startIndex, end: node.endIndex, replace: replacement });
        } else {
          const itemTexts = nonMatched.map((it) => it.text);
          const newInner = " " + itemTexts.join(", ") + " ";
          changes.push({ start: useList.startIndex + 1, end: useList.endIndex - 1, replace: newInner });
        }
        return;
      }
    }
    if (rustUseMatchesSimple(node, importSpec)) {
      changes.push({ start: node.startIndex, end: node.endIndex });
      changeCount++;
    }
  }
  walk(tree.rootNode);
  if (changes.length === 0 || changeCount === 0) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: `No import for '${importSpec}' found` };
  }
  changes.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const c of changes) {
    if (c.replace !== undefined) {
      newSource = newSource.slice(0, c.start) + c.replace + newSource.slice(c.end);
    } else {
      let end = c.end;
      while (end < newSource.length && newSource[end] === `
`)
        end++;
      newSource = newSource.slice(0, c.start) + newSource.slice(end);
    }
  }
  return { success: true, path: filePath, operation: "remove-import", changes: changeCount, message: `Removed ${changeCount} import(s) for '${importSpec}'`, newSource };
}
function findChildByType(node, type) {
  for (let i = 0;i < node.childCount; i++) {
    if (node.child(i).type === type)
      return node.child(i);
  }
  return null;
}
function getUseListItems(useList) {
  const items = [];
  for (let i = 0;i < useList.childCount; i++) {
    const c = useList.child(i);
    if (c.type !== "{" && c.type !== "}" && c.type !== ",")
      items.push(c);
  }
  return items;
}
function findUseListMatches(useList, importSpec) {
  const matched = new Set;
  for (const item of getUseListItems(useList)) {
    if ((item.type === "identifier" || item.type === "self" || item.type === "super" || item.type === "crate") && item.text === importSpec) {
      matched.add(item);
    }
    if (item.type === "scoped_identifier") {
      const last = findLastIdentifier(item);
      if (last && last.text === importSpec)
        matched.add(item);
    }
  }
  return matched;
}
function rustUseMatchesSimple(node, importSpec) {
  for (let ci = 0;ci < node.childCount; ci++) {
    const child = node.child(ci);
    if (child.type === "identifier" && child.text === importSpec)
      return true;
    if (child.type === "scoped_identifier" && lastSegmentMatches(child, importSpec))
      return true;
    if (child.type === "scoped_use_list" && lastSegmentMatches(child, importSpec))
      return true;
  }
  return false;
}
function lastSegmentMatches(node, importSpec) {
  for (let i = node.childCount - 1;i >= 0; i--) {
    const child = node.child(i);
    if (child.type === "identifier")
      return child.text === importSpec;
    if (child.type === "scoped_identifier")
      return lastSegmentMatches(child, importSpec);
  }
  return false;
}
function findLastIdentifier(node) {
  for (let i = node.childCount - 1;i >= 0; i--) {
    const child = node.child(i);
    if (child.type === "identifier")
      return child;
    const found = findLastIdentifier(child);
    if (found)
      return found;
  }
  return null;
}
function insertBeforeSymbolUnchecked(source, filePath, symbolName, content) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return { success: false, path: filePath, operation: "insert-before", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const parser = getParser(lang);
  if (!parser)
    return { success: false, path: filePath, operation: "insert-before", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const tree = parseSource(parser, source);
  let insertPos = -1;
  function find(node) {
    const nameNode = node.childForFieldName("name");
    if (nameNode && nameNode.text === symbolName) {
      insertPos = node.startIndex;
      return true;
    }
    for (const child of node.children) {
      if (find(child))
        return true;
    }
    return false;
  }
  find(tree.rootNode);
  if (insertPos === -1)
    return { success: false, path: filePath, operation: "insert-before", changes: 0, message: `Symbol '${symbolName}' not found`, errorCode: "SYMBOL_NOT_FOUND" /* SYMBOL_NOT_FOUND */ };
  const lineStart = source.lastIndexOf(`
`, insertPos) + 1;
  const indent = source.slice(lineStart, insertPos).match(/^\s*/)?.[0] || "";
  const indented = content.split(`
`).map((l) => indent + l).join(`
`) + `
`;
  const newSource = source.slice(0, insertPos) + indented + source.slice(insertPos);
  return { success: true, path: filePath, operation: "insert-before", changes: 1, message: `Inserted content before '${symbolName}'`, newSource };
}
function insertAfterSymbolUnchecked(source, filePath, symbolName, content) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return { success: false, path: filePath, operation: "insert-after", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const parser = getParser(lang);
  if (!parser)
    return { success: false, path: filePath, operation: "insert-after", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const tree = parseSource(parser, source);
  let insertPos = -1;
  function find(node) {
    const nameNode = node.childForFieldName("name");
    if (nameNode && nameNode.text === symbolName) {
      insertPos = node.endIndex;
      return true;
    }
    for (const child of node.children) {
      if (find(child))
        return true;
    }
    return false;
  }
  find(tree.rootNode);
  if (insertPos === -1)
    return { success: false, path: filePath, operation: "insert-after", changes: 0, message: `Symbol '${symbolName}' not found`, errorCode: "SYMBOL_NOT_FOUND" /* SYMBOL_NOT_FOUND */ };
  const nextNewline = source.indexOf(`
`, insertPos);
  const pos = nextNewline !== -1 ? nextNewline + 1 : source.length;
  const lineStart = source.lastIndexOf(`
`, pos - 1) + 1;
  const indent = source.slice(lineStart, pos).match(/^\s*/)?.[0] || "";
  const indented = content.split(`
`).map((l) => indent + l).join(`
`) + `
`;
  const newSource = source.slice(0, pos) + indented + source.slice(pos);
  return { success: true, path: filePath, operation: "insert-after", changes: 1, message: `Inserted content after '${symbolName}'`, newSource };
}
function parsePythonFromImport(spec, source, tree) {
  const match = spec.match(/^from\s+(\S+)\s+import\s+(.+)/);
  if (!match)
    return null;
  const [, targetModule, namesPart] = match;
  const newNames = namesPart.split(",").map((n2) => n2.trim()).filter(Boolean);
  if (newNames.length === 0)
    return null;
  let existingNode = null;
  function findExisting(n2) {
    if (n2.type === "import_from_statement") {
      for (let i = 0;i < n2.childCount; i++) {
        const child = n2.child(i);
        if (child.type === "dotted_name" && i > 0) {
          if (child.text === targetModule) {
            existingNode = n2;
            return;
          }
        }
      }
    }
    for (let i = 0;i < n2.childCount; i++)
      findExisting(n2.child(i));
  }
  findExisting(tree.rootNode);
  if (existingNode) {
    const existingLine = source.slice(existingNode.startIndex, existingNode.endIndex);
    const existingImportMatch = existingLine.match(/^(from\s+\S+\s+import\s+)(.*)/);
    if (!existingImportMatch)
      return null;
    const [, prefix, existingNamesStr] = existingImportMatch;
    const existingNames = existingNamesStr.split(",").map((n2) => n2.trim());
    const allNew = newNames.filter((n2) => !existingNames.includes(n2));
    if (allNew.length === 0) {
      return { success: false, path: "", operation: "add-import", changes: 0, message: `Import for '${spec}' already exists` };
    }
    const mergedNames = [...existingNames, ...allNew];
    const newLine = prefix + mergedNames.join(", ");
    return {
      success: true,
      path: "",
      operation: "add-import",
      changes: 1,
      message: `Added import: ${spec}`,
      newSource: source.slice(0, existingNode.startIndex) + newLine + source.slice(existingNode.endIndex)
    };
  }
  for (const name of newNames) {
    const dupRegex = new RegExp(`(?:from\\s+\\S+\\s+import|import)\\s+.*\\b${escapeRegex(name)}\\b`);
    if (dupRegex.test(source)) {
      return { success: false, path: "", operation: "add-import", changes: 0, message: `Name '${name}' already imported` };
    }
  }
  return null;
}
var PARAM_NODE_TYPES = new Set([
  "formal_parameters",
  "parameter_list",
  "parameters"
]);
var ARG_NODE_TYPES = new Set([
  "arguments",
  "argument_list"
]);
function insertParameterUnchecked(source, filePath, symbolName, newParam, position = "last") {
  const lang = detectLanguage(filePath);
  if (!lang)
    return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const cfg = configFor(lang);
  if (!cfg)
    return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const parser = getParser(lang);
  if (!parser)
    return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const tree = parseSource(parser, source);
  let found = false;
  let insertPos = -1;
  let insertText = "";
  function find(node, depth) {
    if (depth > 15)
      return false;
    if (cfg.functionTypes.includes(node.type)) {
      const nameNode = node.childForFieldName("name");
      if (nameNode && nameNode.text === symbolName) {
        const paramsNode = node.children.find((c) => PARAM_NODE_TYPES.has(c.type));
        if (paramsNode) {
          const inner = source.slice(paramsNode.startIndex + 1, paramsNode.endIndex - 1).trim();
          if (position === "first") {
            insertPos = paramsNode.startIndex + 1;
            insertText = newParam + (inner.length > 0 ? ", " : "");
          } else {
            insertPos = paramsNode.endIndex - 1;
            insertText = (inner.length > 0 ? ", " : "") + newParam;
          }
          found = true;
          return true;
        }
      }
    }
    for (const child of node.children) {
      if (find(child, depth + 1))
        return true;
    }
    return false;
  }
  find(tree.rootNode, 0);
  if (!found)
    return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: `Symbol '${symbolName}' not found or has no parameters`, errorCode: "SYMBOL_NOT_FOUND" /* SYMBOL_NOT_FOUND */ };
  const newSource = source.slice(0, insertPos) + insertText + source.slice(insertPos);
  return { success: true, path: filePath, operation: "insert-parameter", changes: 1, message: `Inserted parameter '${newParam}' into '${symbolName}'`, newSource };
}
function insertCallArgUnchecked(source, filePath, functionName, argValue) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: "Unsupported language", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const parser = getParser(lang);
  if (!parser)
    return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: "Parser unavailable", errorCode: "UNSUPPORTED_LANGUAGE" /* UNSUPPORTED_LANGUAGE */ };
  const tree = parseSource(parser, source);
  const edits = [];
  function findCalls(node) {
    if (node.type === "call_expression" || node.type === "call") {
      const fnNode = node.childForFieldName("function");
      if (fnNode) {
        const fnName = extractCallableName(fnNode);
        if (fnName === functionName) {
          const argsNode = node.children.find((c) => ARG_NODE_TYPES.has(c.type));
          if (argsNode) {
            const inner = source.slice(argsNode.startIndex + 1, argsNode.endIndex - 1).trim();
            const insertText = (inner.length > 0 ? ", " : "") + argValue;
            edits.push({ start: argsNode.endIndex - 1, end: argsNode.endIndex - 1, text: insertText });
          }
        }
      }
    }
    for (const child of node.children)
      findCalls(child);
  }
  findCalls(tree.rootNode);
  if (edits.length === 0)
    return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: `No call sites for '${functionName}' found` };
  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    newSource = newSource.slice(0, e.start) + e.text + newSource.slice(e.end);
  }
  return { success: true, path: filePath, operation: "insert-call-arg", changes: edits.length, message: `Inserted argument at ${edits.length} call site(s) for '${functionName}'`, newSource };
}
function extractCallableName(node) {
  if (node.type === "identifier")
    return node.text;
  if (node.type === "property_identifier")
    return node.text;
  if (node.type === "member_expression") {
    const prop = node.childForFieldName("property");
    if (prop)
      return extractCallableName(prop);
  }
  for (const child of node.children) {
    if (child.type === "identifier" || child.type === "property_identifier") {
      return child.text;
    }
  }
  return null;
}
function firstParseError(source, filePath) {
  const lang = detectLanguage(filePath);
  if (!lang)
    return null;
  const parser = getParser(lang);
  if (!parser)
    return null;
  const tree = parseSource(parser, source);
  if (!tree.rootNode.hasError)
    return null;
  let found = null;
  const visit = (node2) => {
    if (node2.type === "ERROR" || node2.isMissing) {
      found = node2;
      return true;
    }
    for (const child of node2.children) {
      if (child.hasError && visit(child))
        return true;
    }
    return false;
  };
  visit(tree.rootNode);
  const node = found ?? tree.rootNode;
  return {
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
    nodeType: node.isMissing ? `MISSING ${node.type}` : node.type
  };
}
var allowParseErrors = false;
function setAllowParseErrors(value) {
  allowParseErrors = value;
}
function parseErrorResult(filePath, operation, message, issue) {
  return {
    success: false,
    path: filePath,
    operation,
    changes: 0,
    message,
    error: message,
    errorCode: "PARSE_ERROR" /* PARSE_ERROR */,
    parseIssue: issue
  };
}
function gated(fn, operation) {
  return function(source, filePath, ...rest) {
    const before = firstParseError(source, filePath);
    if (before && !allowParseErrors) {
      return parseErrorResult(filePath, operation, `File has a syntax error at line ${before.line}:${before.column} (${before.nodeType}); refusing to edit a tree that did not parse cleanly. Fix the file, or pass --allow-parse-errors.`, before);
    }
    const result = fn(source, filePath, ...rest);
    if (!result.success || result.newSource === undefined)
      return result;
    if (before)
      return result;
    const after = firstParseError(result.newSource, filePath);
    if (after) {
      return parseErrorResult(filePath, operation, `Edit was discarded: the result does not parse (syntax error at line ${after.line}:${after.column} — ${after.nodeType}). The input parsed cleanly, so this edit would have corrupted the file.`, after);
    }
    return result;
  };
}
var renameSymbol = gated(renameSymbolUnchecked, "rename-symbol");
var replaceBody = gated(replaceBodyUnchecked, "replace-body");
var addImport = gated(addImportUnchecked, "add-import");
var removeImport = gated(removeImportUnchecked, "remove-import");
var insertBeforeSymbol = gated(insertBeforeSymbolUnchecked, "insert-before");
var insertAfterSymbol = gated(insertAfterSymbolUnchecked, "insert-after");
var insertParameter = gated(insertParameterUnchecked, "add-parameter");
var insertCallArg = gated(insertCallArgUnchecked, "add-call-arg");

// src/core/hash-edit.ts
function findAnchorCandidates(lines, windowSize, oldHash) {
  const hits = [];
  if (windowSize <= 0 || windowSize > lines.length)
    return hits;
  for (let start = 0;start + windowSize <= lines.length; start++) {
    if (computeHash(lines.slice(start, start + windowSize).join(`
`)) === oldHash) {
      hits.push(start);
      if (hits.length > 1)
        break;
    }
  }
  return hits;
}
async function replaceHash(filePath, oldHash, newContent, options = {}) {
  const { range, dryRun = false } = options;
  const recoveryMode = options.recovery ?? (options.noRecovery ? "off" : "relocate");
  const fail = (message, errorCode, recovery, extra = {}) => ({
    path: filePath,
    success: false,
    oldHash,
    newHash: "",
    linesChanged: 0,
    stale: false,
    retries: 0,
    message,
    errorCode,
    recovery,
    ...extra
  });
  let content;
  try {
    content = await Bun.file(filePath).text();
  } catch (e) {
    return fail(`Failed to read file: ${e.message}`, "FILE_NOT_FOUND" /* FILE_NOT_FOUND */, "Check that the path exists and is readable.");
  }
  const lines = content.split(`
`);
  if (range) {
    const { start, end } = range;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return fail(`Invalid range: start and end must be integers (got ${start}:${end}).`, "INVALID_ARGUMENT" /* INVALID_ARGUMENT */, "Pass --range as N or N:M with positive integers.");
    }
    if (start < 1 || end < 1) {
      return fail(`Invalid range ${start}:${end}: line numbers are 1-indexed.`, "INVALID_ARGUMENT" /* INVALID_ARGUMENT */, "Use a start and end of 1 or greater.");
    }
    if (start > end) {
      return fail(`Invalid range ${start}:${end}: start is after end.`, "INVALID_ARGUMENT" /* INVALID_ARGUMENT */, "Swap the bounds so start <= end.");
    }
    if (end > lines.length) {
      return fail(`Invalid range ${start}:${end}: file has only ${lines.length} lines.`, "INVALID_ARGUMENT" /* INVALID_ARGUMENT */, `Use an end of at most ${lines.length}.`);
    }
  }
  let targetStart;
  let targetEnd;
  if (range) {
    targetStart = range.start - 1;
    targetEnd = range.end;
  } else {
    targetStart = 0;
    targetEnd = lines.length;
  }
  let targetLines = lines.slice(targetStart, targetEnd);
  let targetText = targetLines.join(`
`);
  const currentHash = computeHash(targetText);
  let stale = false;
  let retries = 0;
  let messageSuffix = "";
  let relocatedTo;
  if (currentHash !== oldHash) {
    const relocatable = recoveryMode === "relocate" && range !== undefined;
    if (!relocatable) {
      return fail(buildStaleMessage(oldHash, currentHash, targetStart + 1, targetEnd), "STALE_ANCHOR" /* STALE_ANCHOR */, "Re-read the file to obtain a current hash, then retry.", { newHash: currentHash, stale: true });
    }
    const candidates = findAnchorCandidates(lines, targetEnd - targetStart, oldHash);
    if (candidates.length === 0) {
      return fail(buildStaleMessage(oldHash, currentHash, targetStart + 1, targetEnd) + `
  The anchored content was not found anywhere else in the file.`, "STALE_ANCHOR" /* STALE_ANCHOR */, "Re-read the file to obtain a current hash, then retry.", { newHash: currentHash, stale: true });
    }
    if (candidates.length > 1) {
      return fail(`AMBIGUOUS ANCHOR: content matching hash ${oldHash} appears at more than one location in ${filePath}.`, "AMBIGUOUS_ANCHOR" /* AMBIGUOUS_ANCHOR */, "Widen the range so the anchored content is unique, then retry.", { newHash: currentHash, stale: true });
    }
    const windowSize = targetEnd - targetStart;
    targetStart = candidates[0];
    targetEnd = targetStart + windowSize;
    targetLines = lines.slice(targetStart, targetEnd);
    targetText = targetLines.join(`
`);
    stale = true;
    retries = 1;
    relocatedTo = { start: targetStart + 1, end: targetEnd };
    messageSuffix = ` (anchor relocated to lines ${relocatedTo.start}-${relocatedTo.end})`;
    addWarning({
      code: "ANCHOR_RELOCATED",
      message: `Anchor content moved; edit applied at lines ${relocatedTo.start}-${relocatedTo.end}.`,
      relocatedTo
    });
  }
  let writePath;
  if (!dryRun) {
    try {
      writePath = assertWritable(filePath, options.pathOptions);
    } catch (e) {
      if (e instanceof PathDeniedError) {
        return fail(e.message, "PATH_DENIED" /* PATH_DENIED */, "Pass --allow-outside-root or choose a path inside the project root.");
      }
      throw e;
    }
  }
  return applyReplacement(filePath, lines, targetStart, targetEnd, targetLines, targetText, newContent, oldHash, dryRun, stale, retries, messageSuffix, relocatedTo, writePath, options.skipParseCheck === true);
}
async function applyReplacement(filePath, lines, targetStart, targetEnd, targetLines, targetText, newContent, oldHash, dryRun, stale, retries, messageSuffix = "", relocatedTo, writePath, skipParseCheck = false) {
  const newContentLines = newContent.split(`
`);
  if (newContentLines[newContentLines.length - 1] === "" && !targetText.endsWith(`
`)) {
    newContentLines.pop();
  }
  const newLines = [
    ...lines.slice(0, targetStart),
    ...newContentLines,
    ...lines.slice(targetEnd)
  ];
  const newFullContent = newLines.join(`
`);
  const newFullHash = computeHash(newFullContent);
  const diff = buildDiff(targetStart + 1, targetLines, newContentLines);
  const linesChanged = Math.abs(newContentLines.length - targetLines.length) + countChangedLines(targetLines, newContentLines);
  const rangeLabel = `range ${targetStart + 1}-${targetEnd}`;
  if (!skipParseCheck) {
    const after = firstParseError(newFullContent, filePath);
    if (after) {
      const lines0 = lines.join(`
`);
      const before = firstParseError(lines0, filePath);
      if (!before) {
        return {
          path: filePath,
          success: false,
          oldHash,
          newHash: "",
          linesChanged: 0,
          stale: false,
          retries,
          errorCode: "PARSE_ERROR" /* PARSE_ERROR */,
          message: `Edit was discarded: the result does not parse (syntax error at line ${after.line}:${after.column} — ${after.nodeType}). ` + `The file parsed cleanly before, so this replacement would have corrupted it.`,
          recovery: `structured-edit read-hash ${filePath} ${after.line} — re-read around the break, or pass --allow-parse-errors to write anyway.`
        };
      }
    }
  }
  if (!dryRun) {
    const target = writePath ?? filePath;
    recordSnapshot(target, newFullContent);
    atomicWrite(target, newFullContent);
  }
  const action = dryRun ? "Dry run: would replace" : "Replaced";
  return {
    path: filePath,
    success: true,
    oldHash,
    newHash: newFullHash,
    linesChanged,
    stale,
    retries,
    relocatedTo,
    message: dryRun ? `${action} ${targetLines.length} lines with ${newContentLines.length} lines${messageSuffix}` : `${action} ${targetLines.length} lines with ${newContentLines.length} lines${messageSuffix} (${rangeLabel})`,
    diff
  };
}
function buildStaleMessage(expected, actual, start, end) {
  return `STALE ANCHOR: Content hash mismatch in lines ${start}-${end}.
` + `  Expected hash: ${expected}
` + `  Actual hash:   ${actual}
` + `  The file has been modified since the hash was computed.
` + `  Re-read the file and retry with the current hash.`;
}
function buildDiff(startLine, oldLines, newLines) {
  const maxCtx = 3;
  const parts = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let changeStart = -1;
  let changeEnd = -1;
  for (let i = 0;i < maxLen; i++) {
    const oldL = oldLines[i] ?? "";
    const newL = newLines[i] ?? "";
    if (oldL !== newL) {
      if (changeStart === -1)
        changeStart = i;
      changeEnd = i;
    }
  }
  if (changeStart === -1)
    return "(no changes)";
  const ctxStart = Math.max(0, changeStart - maxCtx);
  const ctxEnd = Math.min(maxLen - 1, changeEnd + maxCtx);
  for (let i = ctxStart;i <= ctxEnd; i++) {
    const ln = startLine + i;
    const oldL = oldLines[i];
    const newL = newLines[i];
    if (oldL === undefined && newL !== undefined) {
      parts.push(`+ ${ln} | ${newL}`);
    } else if (newL === undefined && oldL !== undefined) {
      parts.push(`- ${ln} | ${oldL}`);
    } else if (oldL !== newL) {
      parts.push(`- ${ln} | ${oldL}`);
      parts.push(`+ ${ln} | ${newL}`);
    } else {
      parts.push(`  ${ln} | ${oldL}`);
    }
  }
  return parts.join(`
`);
}
function countChangedLines(oldLines, newLines) {
  let count = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0;i < maxLen; i++) {
    if ((oldLines[i] ?? "") !== (newLines[i] ?? ""))
      count++;
  }
  return count;
}
// src/core/verify.ts
var EXT_TOOLS = {
  ".ts": { typecheck: "tsc --noEmit", test: "bun test" },
  ".tsx": { typecheck: "tsc --noEmit", test: "bun test" },
  ".py": { typecheck: "mypy", test: "pytest" },
  ".go": { typecheck: "go vet", test: "go test" },
  ".rs": { typecheck: "cargo check", test: "cargo test" },
  ".js": { test: "bun test" },
  ".jsx": { test: "bun test" }
};
var TEST_RUNNER_MAP = {
  "bun test": "bun test",
  vitest: "npx vitest run",
  jest: "npx jest",
  pytest: "python -m pytest",
  "go test": "go test ./...",
  "cargo test": "cargo test"
};
function buildTestFilterArgs(runner, filter) {
  switch (runner) {
    case "bun test":
      return [filter];
    case "vitest":
      return ["--testNamePattern", filter];
    case "jest":
      return ["--testNamePattern", filter];
    case "pytest":
      return ["-k", filter];
    case "go test":
      return ["-run", filter];
    case "cargo test":
      return [filter];
    default:
      return [filter];
  }
}
async function scanPackageJson(rootDir) {
  const tools = {};
  try {
    const raw = await Bun.file(`${rootDir}/package.json`).text();
    const pkg = JSON.parse(raw);
    const deps = { ...pkg.devDependencies, ...pkg.dependencies };
    if (deps.prettier)
      tools.formatter = "prettier --write";
    if (deps.eslint)
      tools.linter = "eslint";
    if (deps.vitest)
      tools.testRunner = "vitest";
    else if (deps.jest)
      tools.testRunner = "jest";
    if (deps.typescript)
      tools.typecheck = "tsc --noEmit";
    if (deps["@biomejs/biome"]) {
      if (!tools.formatter)
        tools.formatter = "biome format --write";
      if (!tools.linter)
        tools.linter = "biome lint";
    }
  } catch {}
  return tools;
}
async function scanPyprojectToml(rootDir) {
  const tools = {};
  try {
    const raw = await Bun.file(`${rootDir}/pyproject.toml`).text();
    if (/\[tool\.pytest\]/.test(raw))
      tools.testRunner = "pytest";
    if (/\[tool\.mypy\]/.test(raw))
      tools.typecheck = "mypy";
    if (/\[tool\.ruff\]/.test(raw)) {
      if (!tools.linter)
        tools.linter = "ruff check";
    }
  } catch {}
  return tools;
}
async function scanGoMod(rootDir) {
  const tools = {};
  try {
    await Bun.file(`${rootDir}/go.mod`).text();
    tools.typecheck = "go vet";
    tools.testRunner = "go test";
  } catch {}
  return tools;
}
async function scanCargoToml(rootDir) {
  const tools = {};
  try {
    await Bun.file(`${rootDir}/Cargo.toml`).text();
    tools.formatter = "rustfmt --edition 2021";
    tools.linter = "cargo clippy";
    tools.typecheck = "cargo check";
    tools.testRunner = "cargo test";
  } catch {}
  return tools;
}
var CONFIG_SCANNERS = {
  "package.json": scanPackageJson,
  "pyproject.toml": scanPyprojectToml,
  "go.mod": scanGoMod,
  "Cargo.toml": scanCargoToml
};
async function findProjectRoot2(fromDir) {
  let dir = fromDir;
  for (let i = 0;i < 10; i++) {
    for (const fname of Object.keys(CONFIG_SCANNERS)) {
      const f = Bun.file(`${dir}/${fname}`);
      if (await f.exists())
        return dir;
    }
    const parent = dir.split("/").slice(0, -1).join("/") || "/";
    if (parent === dir)
      break;
    dir = parent;
  }
  return fromDir;
}
async function detectTools(files, options) {
  if (!options.autoDetect)
    return { detected: {}, effective: options };
  const detected = {};
  const rootDir = files.length > 0 ? await findProjectRoot2(files[0].split("/").slice(0, -1).join("/") || ".") : ".";
  for (const [fname, scanner] of Object.entries(CONFIG_SCANNERS)) {
    const exists = await Bun.file(`${rootDir}/${fname}`).exists();
    if (exists) {
      const tools = await scanner(rootDir);
      if (tools.formatter)
        detected.formatter = tools.formatter;
      if (tools.linter)
        detected.linter = tools.linter;
      if (tools.typecheck)
        detected.typecheck = tools.typecheck;
      if (tools.testRunner)
        detected.testRunner = tools.testRunner;
      break;
    }
  }
  if (!detected.testRunner && files.length > 0) {
    const exts = new Set(files.map((f) => {
      const m = f.match(/\.([^.]+)$/);
      return m ? `.${m[1]}` : "";
    }));
    for (const ext of exts) {
      const defs = EXT_TOOLS[ext];
      if (defs) {
        if (!detected.testRunner)
          detected.testRunner = defs.test;
        if (!detected.typecheck && defs.typecheck)
          detected.typecheck = defs.typecheck;
      }
    }
  }
  return {
    detected,
    effective: {
      ...options,
      formatter: options.formatter || detected.formatter,
      linter: options.linter || detected.linter,
      typecheck: options.typecheck || detected.typecheck,
      testRunner: options.testRunner || detected.testRunner
    }
  };
}
async function runTool(cmd, args, timeoutMs = 30000) {
  const parts = cmd.split(" ");
  const binary = parts[0];
  const builtinArgs = parts.slice(1);
  const allArgs = [...builtinArgs, ...args];
  const controller = new AbortController;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const proc = Bun.spawn([binary, ...allArgs], {
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return {
      passed: exitCode === 0,
      output: (stdout + `
` + stderr).trim()
    };
  } catch (err) {
    return {
      passed: false,
      output: `Failed to run ${cmd}: ${err.message}`
    };
  } finally {
    clearTimeout(timer);
  }
}
async function verifyChanges(files, options = {}) {
  const start = Date.now();
  const fileHashes = {};
  const timeout = options.timeout ?? 30000;
  const originals = new Map;
  if (options.revertOnFailure) {
    for (const f of files) {
      try {
        originals.set(f, await Bun.file(f).text());
      } catch {}
    }
  }
  for (const f of files) {
    try {
      const content = await Bun.file(f).text();
      fileHashes[f] = computeHash(content);
    } catch {
      fileHashes[f] = "ERROR";
    }
  }
  const { detected, effective } = await detectTools(files, options);
  const formatter = effective.formatter ? await runTool(effective.formatter, [...options.formatterArgs || [], ...files], timeout) : undefined;
  const linter = effective.linter ? await runTool(effective.linter, [...options.linterArgs || [], ...files], timeout) : undefined;
  const typecheck = effective.typecheck ? await runTool(effective.typecheck, files, timeout) : undefined;
  let tests;
  if (effective.testRunner || options.testFilter) {
    const runner = effective.testRunner || "bun test";
    const runnerCmd = TEST_RUNNER_MAP[runner] || runner;
    const testArgs = [
      ...options.testArgs || [],
      ...options.testFilter ? buildTestFilterArgs(runner, options.testFilter) : []
    ];
    tests = await runTool(runnerCmd, testArgs, timeout);
  }
  const elapsed = Date.now() - start;
  const allPass = (!formatter || formatter.passed) && (!linter || linter.passed) && (!typecheck || typecheck.passed) && (!tests || tests.passed);
  const failedIn = [];
  if (formatter && !formatter.passed)
    failedIn.push("formatter");
  if (linter && !linter.passed)
    failedIn.push("linter");
  if (typecheck && !typecheck.passed)
    failedIn.push("typecheck");
  if (tests && !tests.passed)
    failedIn.push("tests");
  const overall = allPass ? "pass" : "fail";
  const result = {
    files,
    formatter: formatter || undefined,
    linter: linter || undefined,
    typecheck: typecheck || undefined,
    tests: tests || undefined,
    overall,
    elapsed_ms: elapsed,
    fileHashes,
    detected: Object.keys(detected).length > 0 ? detected : undefined
  };
  if (overall === "fail" && options.revertOnFailure && originals.size > 0) {
    const reverted = [];
    for (const [f, original] of originals) {
      try {
        await safeWrite(f, original);
        reverted.push(f);
      } catch {}
    }
    result.revertedFiles = reverted;
  }
  recordEvent({
    operation: "verify-changes",
    route: "verify",
    success: overall === "pass",
    verification_result: overall,
    failed_in: failedIn.length > 0 ? failedIn : undefined,
    elapsed_ms: elapsed,
    files_count: files.length
  });
  return result;
}
// src/core/diff-engine.ts
function lcsTable(a, b) {
  const m = a.length;
  const n2 = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n2 + 1).fill(0));
  for (let i = 1;i <= m; i++) {
    for (let j = 1;j <= n2; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}
function backtrack(a, b, dp) {
  const result = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: "same", line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", line: b[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", line: a[i - 1] });
      i--;
    }
  }
  result.reverse();
  return result;
}
function groupHunks(ops, contextLines) {
  const hunks = [];
  const len = ops.length;
  let i = 0;
  const regions = [];
  while (i < len) {
    while (i < len && ops[i].type === "same")
      i++;
    if (i >= len)
      break;
    const changeStart = i;
    while (i < len && ops[i].type !== "same")
      i++;
    const changeEnd = i;
    const start = Math.max(0, changeStart - contextLines);
    const end = Math.min(len, changeEnd + contextLines);
    if (regions.length > 0 && start <= regions[regions.length - 1].end) {
      regions[regions.length - 1].end = end;
    } else {
      regions.push({ start, end });
    }
  }
  for (const region of regions) {
    let oldStart = 1;
    let oldLines = 0;
    let newStart = 1;
    let newLines = 0;
    for (let k2 = 0;k2 < region.start; k2++) {
      if (ops[k2].type !== "added")
        oldStart++;
      if (ops[k2].type !== "removed")
        newStart++;
    }
    const lines = [];
    let k = region.start;
    for (;k < region.end; k++) {
      if (ops[k].type === "same") {
        oldLines++;
        newLines++;
        lines.push(` ${ops[k].line}`);
      } else if (ops[k].type === "removed") {
        oldLines++;
        lines.push(`-${ops[k].line}`);
      } else {
        newLines++;
        lines.push(`+${ops[k].line}`);
      }
    }
    const header = `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`;
    hunks.push({ oldStart, oldLines, newStart, newLines, header, lines });
  }
  return hunks;
}
function generateUnifiedDiff(oldSource, newSource, filePath, contextLines = 3) {
  const oldLines = oldSource.split(`
`);
  const newLines = newSource.split(`
`);
  const dp = lcsTable(oldLines, newLines);
  const ops = backtrack(oldLines, newLines, dp);
  const hunks = groupHunks(ops, contextLines);
  if (hunks.length === 0)
    return "";
  const parts = [];
  parts.push(`--- a/${filePath}`);
  parts.push(`+++ b/${filePath}`);
  for (const hunk of hunks) {
    parts.push(hunk.header);
    for (const line of hunk.lines) {
      parts.push(line);
    }
  }
  return parts.join(`
`) + `
`;
}
function parsePatch(patchText) {
  const lines = patchText.split(`
`);
  const hunks = [];
  let filePath = "";
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("--- a/")) {
      filePath = line.slice(6);
      i++;
      continue;
    }
    if (line.startsWith("--- ") && !line.startsWith("--- a/")) {
      filePath = line.slice(4);
      i++;
      continue;
    }
    if (line.startsWith("+++ ")) {
      i++;
      continue;
    }
    const hdrMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hdrMatch) {
      const oldStart = parseInt(hdrMatch[1]);
      const oldLines = hdrMatch[2] !== undefined ? parseInt(hdrMatch[2]) : 1;
      const newStart = parseInt(hdrMatch[3]);
      const newLines = hdrMatch[4] !== undefined ? parseInt(hdrMatch[4]) : 1;
      const hunkLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("--- ")) {
        hunkLines.push(lines[i]);
        i++;
      }
      hunks.push({ oldStart, oldLines, newStart, newLines, header: line, lines: hunkLines });
      continue;
    }
    i++;
  }
  return { filePath, hunks };
}
function applyPatchToSource(source, patchText, options) {
  const fuzzy = options?.fuzzyMatch ?? 3;
  const parsed = parsePatch(patchText);
  if (parsed.hunks.length === 0) {
    return { success: false, hunksApplied: 0, hunksFailed: 0, message: "No hunks found in patch" };
  }
  const srcLines = source.split(`
`);
  let hunksApplied = 0;
  let hunksFailed = 0;
  let lineOffset = 0;
  for (const hunk of parsed.hunks) {
    const result = applyHunk(srcLines, hunk, lineOffset, fuzzy);
    if (result.success) {
      lineOffset += result.offsetDelta;
      hunksApplied++;
    } else {
      hunksFailed++;
      if (result.error) {
        return { success: false, hunksApplied, hunksFailed, message: result.error };
      }
    }
  }
  const newSource = srcLines.join(`
`);
  return {
    success: hunksFailed === 0,
    hunksApplied,
    hunksFailed,
    message: hunksFailed === 0 ? `Applied ${hunksApplied} hunk(s)` : `Applied ${hunksApplied}, failed ${hunksFailed}`,
    newSource
  };
}
async function applyPatch(filePath, patchText, options) {
  const dryRun = options?.dryRun ?? false;
  let source;
  try {
    source = await Bun.file(filePath).text();
  } catch {
    return { success: false, hunksApplied: 0, hunksFailed: parsePatch(patchText).hunks.length, message: `Cannot read file: ${filePath}` };
  }
  const result = applyPatchToSource(source, patchText, options);
  if (result.success && result.newSource && !dryRun) {
    try {
      await safeWrite(filePath, result.newSource);
    } catch {
      return { success: false, hunksApplied: result.hunksApplied, hunksFailed: result.hunksFailed, message: `Cannot write file: ${filePath}` };
    }
  }
  return result;
}
function applyHunk(srcLines, hunk, lineOffset, fuzzy) {
  const targetOldStart = hunk.oldStart + lineOffset - 1;
  const searchStart = Math.max(0, targetOldStart - fuzzy);
  const searchEnd = Math.min(srcLines.length, targetOldStart + fuzzy + hunk.oldLines + 1);
  let matchIdx = -1;
  for (let srcPos = searchStart;srcPos < searchEnd; srcPos++) {
    if (hunkMatches(srcLines, hunk, srcPos)) {
      matchIdx = srcPos;
      break;
    }
  }
  if (matchIdx < 0) {
    return {
      success: false,
      offsetDelta: 0,
      error: `Hunk failed at ${hunk.header}: context not found near line ${targetOldStart + 1}`
    };
  }
  const replacementLines = [];
  for (const hl of hunk.lines) {
    if (hl.startsWith(" ")) {
      replacementLines.push(hl.slice(1));
    } else if (hl.startsWith("+")) {
      replacementLines.push(hl.slice(1));
    }
  }
  srcLines.splice(matchIdx, hunk.oldLines, ...replacementLines);
  const offsetDelta = replacementLines.length - hunk.oldLines;
  return { success: true, offsetDelta };
}
function hunkMatches(srcLines, hunk, srcPos) {
  let s = srcPos;
  for (const hl of hunk.lines) {
    if (hl.startsWith(" ")) {
      if (s >= srcLines.length || srcLines[s] !== hl.slice(1))
        return false;
      s++;
    } else if (hl.startsWith("-")) {
      if (s >= srcLines.length || srcLines[s] !== hl.slice(1))
        return false;
      s++;
    } else if (hl.startsWith("+")) {}
  }
  return s - srcPos === hunk.oldLines;
}
// src/core/config.ts
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "fs";
import { join as join4 } from "path";
var DEFAULT_CONFIG = {
  telemetry: { enabled: true, maxFileSize: 10 * 1024 * 1024, maxRotatedFiles: 10, retentionDays: 30 }
};
var ROUTE_PRECEDENCE = ["diff", "hash", "ast"];
function resolveConflict(fromLang, fromOp, method = "operation") {
  if (!fromLang && !fromOp)
    return;
  if (!fromOp)
    return fromLang;
  if (!fromLang)
    return fromOp;
  if (method === "language")
    return fromLang;
  if (method === "operation")
    return fromOp;
  return ROUTE_PRECEDENCE.indexOf(fromLang) <= ROUTE_PRECEDENCE.indexOf(fromOp) ? fromLang : fromOp;
}
function policyForce(policy, language2, operation) {
  if (!policy)
    return;
  const fromLang = language2 ? policy.languageOverrides?.[language2] : undefined;
  const fromOp = policy.operationOverrides?.[operation];
  if (!fromLang && !fromOp)
    return;
  return resolveConflict(fromLang, fromOp, policy.conflictResolution);
}
function loadConfig(configPath) {
  const paths = [];
  const globalDir = join4(process.env.HOME || "/root", ".config", "hashpilot");
  const globalPath = join4(globalDir, "config.json");
  if (existsSync4(globalPath))
    paths.push(globalPath);
  const projectPath = join4(process.cwd(), ".hashpilot.json");
  if (existsSync4(projectPath) && projectPath !== globalPath)
    paths.push(projectPath);
  if (configPath && existsSync4(configPath) && !paths.includes(configPath)) {
    paths.push(configPath);
  }
  const config = { ...DEFAULT_CONFIG };
  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync3(p, "utf-8"));
      mergeConfig(config, data);
    } catch {}
  }
  const envPolicy = process.env.HASHPILOT_ROUTE_POLICY;
  if (envPolicy) {
    try {
      const parsed = JSON.parse(envPolicy);
      mergeConfig(config, { routePolicy: parsed });
    } catch {}
  }
  return config;
}
function mergeConfig(base, override) {
  if (override.telemetry) {
    base.telemetry = { ...base.telemetry, ...override.telemetry };
  }
  if (override.routePolicy) {
    const basePolicy = base.routePolicy || {};
    base.routePolicy = {
      ...basePolicy,
      conflictResolution: override.routePolicy.conflictResolution ?? basePolicy.conflictResolution,
      languageOverrides: { ...basePolicy.languageOverrides, ...override.routePolicy.languageOverrides },
      operationOverrides: { ...basePolicy.operationOverrides, ...override.routePolicy.operationOverrides }
    };
  }
  if (override.provenance) {
    base.provenance = { ...base.provenance, ...override.provenance };
  }
  if (override.snapshots) {
    base.snapshots = { ...base.snapshots, ...override.snapshots };
  }
  if (override.allowedRoots) {
    base.allowedRoots = [...base.allowedRoots || [], ...override.allowedRoots];
  }
}

// src/core/provenance.ts
var _cachedConfig = null;
function getConfig() {
  if (!_cachedConfig)
    _cachedConfig = loadConfig();
  return _cachedConfig;
}
function createChangeSet() {
  return crypto.randomUUID();
}
function truncate(val, maxLen) {
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}
function buildProvenanceFields(input) {
  const fields = {};
  const config = getConfig();
  const actor = input.actor ?? config.provenance?.defaultActor;
  if (actor !== undefined)
    fields.actor = truncate(actor, 80);
  if (input.taskId !== undefined)
    fields.taskId = truncate(input.taskId, 80);
  if (input.changeSetId !== undefined)
    fields.changeSetId = input.changeSetId;
  if (input.reason !== undefined)
    fields.reason = truncate(input.reason, 200);
  if (input.stepIndex !== undefined)
    fields.stepIndex = input.stepIndex;
  if (input.stepTotal !== undefined)
    fields.stepTotal = input.stepTotal;
  if (input.source !== undefined) {
    fields.beforeHash = computeHash(input.source);
  }
  if (input.source !== undefined && input.newSource !== undefined) {
    fields.afterHash = computeHash(input.newSource);
    const captureDiffs = config.provenance?.captureDiffs === true;
    const sensitive = input.filePath !== undefined && isSensitiveFile(input.filePath);
    if (captureDiffs && !sensitive && input.source !== input.newSource) {
      fields.diff = redactSecrets(generateUnifiedDiff(input.source, input.newSource, input.filePath ? input.filePath.replace(/^\//, "") : "unknown", 3));
    }
  }
  if (input.context !== undefined) {
    const maxLen = config.provenance?.maxContextLength ?? 500;
    fields.context = input.context.length > maxLen ? input.context.slice(0, maxLen) + "..." : input.context;
  }
  return fields;
}
function diffCoversLine(diff, targetLine) {
  const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match;
  while ((match = hunkRe.exec(diff)) !== null) {
    const newStart = parseInt(match[3], 10);
    const newCount = match[4] ? parseInt(match[4], 10) : 1;
    if (targetLine >= newStart && targetLine < newStart + newCount) {
      return true;
    }
  }
  return false;
}
function toProvenanceEntry(e) {
  return {
    timestamp: e.timestamp,
    sessionId: e.sessionId,
    actor: e.actor ?? "unknown",
    taskId: e.taskId,
    changeSetId: e.changeSetId,
    reason: e.reason ?? e.operation,
    operation: e.operation,
    route: e.route,
    success: e.success,
    beforeHash: e.beforeHash,
    afterHash: e.afterHash,
    diff: e.diff,
    stepIndex: e.stepIndex,
    stepTotal: e.stepTotal,
    context: e.context,
    verification: e.verification_result
  };
}
function provenanceQuery(file, line, fuzzy) {
  const all = exportEvents();
  const fileEvents = all.filter((e) => e.file === file);
  const filtered = line !== undefined ? fileEvents.filter((e) => {
    if (!e.diff)
      return fuzzy;
    return diffCoversLine(e.diff, line);
  }) : fileEvents;
  return filtered.map(toProvenanceEntry).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
function changeSetQuery(changeSetId) {
  const all = exportEvents();
  const entries = all.filter((e) => e.changeSetId === changeSetId).map(toProvenanceEntry).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (entries.length === 0)
    return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  return {
    changeSetId,
    taskId: first.taskId,
    actor: first.actor,
    reason: first.reason,
    editCount: entries.length,
    entries,
    timeRange: { first: first.timestamp, last: last.timestamp }
  };
}
function formatProvenanceHuman(entries) {
  if (entries.length === 0)
    return "No edits found for this file.";
  const lines = [];
  for (const e of entries) {
    const ts = e.timestamp.slice(0, 19).replace("T", " ");
    const status = e.success ? "OK" : "FAIL";
    const step = e.stepTotal ? ` [${(e.stepIndex ?? 0) + 1}/${e.stepTotal}]` : "";
    const task = e.taskId ? ` task=${e.taskId}` : "";
    const reason = e.reason !== e.operation ? ` "${e.reason}"` : "";
    lines.push(`${ts}  ${e.actor}${task}  ${e.operation}  ${e.route}  ${status}${step}${reason}`);
  }
  return lines.join(`
`);
}

// src/core/router.ts
function chooseRoute(filePath, operation, policy) {
  const lang = detectLanguage(filePath);
  const reasons = [];
  let policyApplied = false;
  let policySource;
  const extMatch = filePath.match(/\.([^.]+)$/);
  const extKey = lang || (extMatch ? extMatch[1] : null);
  const forced = policyForce(policy, extKey, operation);
  if (forced) {
    const src = lang && policy?.languageOverrides?.[lang] ? `language override for '${lang}'` : `operation override for '${operation}'`;
    const fromConf = lang && policy?.languageOverrides?.[lang] ? "language" : "operation";
    reasons.push(`Policy ${fromConf} forces route '${forced}'`);
    policyApplied = true;
    policySource = forced !== chooseRoute(filePath, operation).route ? fromConf : undefined;
    return { route: forced, explanation: { route: forced, reasons, policyApplied, policySource } };
  }
  if (isLanguageSupported(filePath) && isASTOperation(operation)) {
    reasons.push(`Language '${lang}' supports AST operations`);
    return { route: "ast", explanation: { route: "ast", reasons, policyApplied: false } };
  }
  if (isHashOperation(operation)) {
    reasons.push(`Operation '${operation}' uses hash-based editing`);
    return { route: "hash", explanation: { route: "hash", reasons, policyApplied: false } };
  }
  const unsupported = !isLanguageSupported(filePath) ? `Language '${lang || "unknown"}' not supported for AST` : `Operation '${operation}' not available via AST or hash`;
  reasons.push(unsupported);
  reasons.push(`Falling back to diff route`);
  return { route: "diff", explanation: { route: "diff", reasons, policyApplied: false } };
}
function isASTOperation(op) {
  return [
    "rename-symbol",
    "replace-body",
    "add-import",
    "remove-import",
    "insert-before",
    "insert-after",
    "find-symbols"
  ].includes(op);
}
function isHashOperation(op) {
  return ["read-hash", "replace-hash"].includes(op);
}
async function routeEdit(params) {
  const start = Date.now();
  let editSource;
  let editResult;
  const { filePath, operation, method, policy, oldHash, newContent, range, oldName, newName, symbolName, newBody, importSpec, content: insertContent, oldContent, dryRun, actor, taskId, reason } = params;
  let route;
  let explanation;
  const resolvedPolicy = policy || loadConfig().routePolicy;
  if (method) {
    route = method;
    explanation = { route, reasons: [`Explicit method override: ${method}`], policyApplied: false };
  } else {
    const decision = chooseRoute(filePath, operation, resolvedPolicy);
    route = decision.route;
    explanation = decision.explanation;
    if (route === "diff" && explanation.reasons.some((r) => r.startsWith("Falling back"))) {
      addWarning({
        code: "ROUTE_FALLBACK",
        message: explanation.reasons.join("; "),
        from: "ast",
        to: "diff"
      });
    }
  }
  let result;
  let routeReason = explanation.reasons.join("; ");
  let fallback;
  if (route === "ast" && !isLanguageSupported(filePath)) {
    if (method) {
      result = { success: false, message: `Cannot force AST route: ${filePath} is not a supported language file` };
    } else {
      fallback = "AST unsupported for this file type";
      addWarning({ code: "ROUTE_FALLBACK", message: fallback, from: "ast", to: "hash" });
      route = "hash";
    }
  }
  if (route === "hash") {
    if (!oldHash || !newContent) {
      route = "diff";
      fallback = "Hash edit requires oldHash and newContent";
      addWarning({ code: "ROUTE_FALLBACK", message: fallback, from: "hash", to: "diff" });
    }
  }
  routeReason = `${explanation.reasons.join("; ")}${fallback ? `; ${fallback}` : ""}`;
  if (!result) {
    switch (route) {
      case "ast": {
        let source;
        try {
          source = await Bun.file(filePath).text();
          editSource = source;
        } catch (e) {
          result = { success: false, message: `Failed to read file: ${e.message}` };
          break;
        }
        try {
          switch (operation) {
            case "rename-symbol":
              result = renameSymbol(source, filePath, oldName, newName);
              break;
            case "replace-body":
              result = replaceBody(source, filePath, symbolName, newBody);
              break;
            case "add-import":
              result = addImport(source, filePath, importSpec);
              break;
            case "remove-import":
              result = removeImport(source, filePath, importSpec);
              break;
            case "insert-before":
              result = insertBeforeSymbol(source, filePath, symbolName, insertContent);
              break;
            case "insert-after":
              result = insertAfterSymbol(source, filePath, symbolName, insertContent);
              break;
            case "find-symbols":
              result = { success: true, symbols: findSymbols(source, filePath), message: "Symbols found" };
              break;
            default:
              result = { success: false, message: `Unknown AST operation: ${operation}` };
          }
        } catch (e) {
          result = {
            success: false,
            errorCode: "PARSE_ERROR" /* PARSE_ERROR */,
            message: `AST parse failed for ${filePath}: ${e?.message ?? e}`,
            recovery: "Retry with an explicit --old-content/--new-content pair to use the diff route."
          };
          addWarning({
            code: "ROUTE_FALLBACK",
            message: `AST route failed to parse ${filePath}; a diff-route edit is the remaining option.`,
            from: "ast",
            to: "diff"
          });
        }
        if (result.success && result.newSource && !dryRun) {
          await safeWrite(filePath, result.newSource);
          editResult = result.newSource;
        }
        break;
      }
      case "hash":
        editSource = await Bun.file(filePath).text();
        result = await replaceHash(filePath, oldHash, newContent, { range, dryRun });
        editResult = await Bun.file(filePath).text();
        break;
      case "diff": {
        if (!oldContent || !newContent) {
          result = { success: false, message: "Diff route requires oldContent and newContent" };
          break;
        }
        let source;
        try {
          source = await Bun.file(filePath).text();
          editSource = source;
        } catch (e) {
          result = { success: false, message: `Failed to read file: ${e.message}` };
          break;
        }
        result = applyTextReplace(source, filePath, oldContent, newContent);
        if (result.success && result.newSource) {
          const after = firstParseError(result.newSource, filePath);
          if (after && !firstParseError(source, filePath)) {
            result = {
              success: false,
              errorCode: "PARSE_ERROR" /* PARSE_ERROR */,
              message: `Edit was discarded: the result does not parse (syntax error at line ${after.line}:${after.column} — ${after.nodeType}). ` + `The file parsed cleanly before, so this replacement would have corrupted it.`
            };
            break;
          }
        }
        if (result.success && result.newSource && !dryRun) {
          await safeWrite(filePath, result.newSource);
          editResult = result.newSource;
        }
        break;
      }
      default:
        result = { success: false, message: `Unknown route: ${route}` };
    }
  }
  const elapsed = Date.now() - start;
  let errorCode;
  if (!result.success) {
    if (result.stale) {
      errorCode = "STALE_ANCHOR" /* STALE_ANCHOR */;
    } else if (result.message?.includes("not found") || result.message?.includes("ENOENT")) {
      errorCode = "FILE_NOT_FOUND" /* FILE_NOT_FOUND */;
    } else if (result.message?.includes("hash")) {
      errorCode = "HASH_MISMATCH" /* HASH_MISMATCH */;
    }
  }
  const provenanceFields = buildProvenanceFields({
    actor,
    taskId,
    reason,
    source: editSource,
    newSource: editResult,
    filePath
  });
  recordEvent({
    operation,
    route,
    file: filePath,
    language: detectLanguage(filePath) || undefined,
    success: result.success ?? false,
    fallback_reason: fallback,
    retries: result.retries,
    elapsed_ms: elapsed,
    errorCode,
    ...provenanceFields
  });
  return { route, routeReason, fallback, result, elapsed_ms: elapsed, explanation };
}
function applyTextReplace(source, filePath, oldContent, newContent) {
  const occurrences = [];
  let idx = 0;
  while ((idx = source.indexOf(oldContent, idx)) !== -1) {
    const lineNum = source.slice(0, idx).split(`
`).length;
    occurrences.push(lineNum);
    idx += oldContent.length;
  }
  if (occurrences.length === 0) {
    return { success: false, message: `Content not found in ${filePath}. File may have changed — re-read and retry.` };
  }
  if (occurrences.length > 1) {
    const locs = occurrences.map((l) => `line ${l}`).join(", ");
    return {
      success: false,
      message: `Content appears ${occurrences.length} times (${locs}). Provide more context to disambiguate.`
    };
  }
  const newSource = source.split(oldContent).join(newContent);
  return {
    success: true,
    message: `Replaced content at line ${occurrences[0]}`,
    newSource
  };
}
// src/core/batch-edit.ts
async function editOne(file, params) {
  return routeEdit({
    filePath: file,
    operation: params.operation,
    method: params.method,
    policy: params.policy,
    oldHash: params.oldHash,
    newContent: params.newContent,
    range: params.range,
    oldName: params.oldName,
    newName: params.newName,
    symbolName: params.symbolName,
    newBody: params.newBody,
    importSpec: params.importSpec,
    content: params.content,
    oldContent: params.oldContent,
    dryRun: params.dryRun,
    actor: params.actor,
    taskId: params.taskId,
    reason: params.reason
  });
}
async function editMany(params) {
  const start = Date.now();
  const uniqueFiles = [...new Set(params.files)];
  const results = await Promise.all(uniqueFiles.map((f) => editOne(f, params)));
  const elapsed = Date.now() - start;
  const succeeded = results.filter((r) => r.result.success).length;
  const failed = results.length - succeeded;
  recordEvent({
    operation: `batch-${params.operation}`,
    route: "batch",
    files_count: uniqueFiles.length,
    success: failed === 0,
    elapsed_ms: elapsed
  });
  return {
    results,
    summary: { total: uniqueFiles.length, succeeded, failed, elapsed_ms: elapsed }
  };
}
async function editManySerial(params) {
  const start = Date.now();
  const results = [];
  for (const f of params.files) {
    results.push(await editOne(f, params));
  }
  const elapsed = Date.now() - start;
  const succeeded = results.filter((r) => r.result.success).length;
  const failed = results.length - succeeded;
  recordEvent({
    operation: `batch-${params.operation}-serial`,
    route: "batch",
    files_count: params.files.length,
    success: failed === 0,
    elapsed_ms: elapsed
  });
  return {
    results,
    summary: { total: params.files.length, succeeded, failed, elapsed_ms: elapsed }
  };
}
// node_modules/minimatch/dist/esm/index.js
var import_brace_expansion = __toESM(require_brace_expansion(), 1);

// node_modules/minimatch/dist/esm/assert-valid-pattern.js
var MAX_PATTERN_LENGTH = 1024 * 64;
var assertValidPattern = (pattern) => {
  if (typeof pattern !== "string") {
    throw new TypeError("invalid pattern");
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new TypeError("pattern is too long");
  }
};

// node_modules/minimatch/dist/esm/brace-expressions.js
var posixClasses = {
  "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true],
  "[:alpha:]": ["\\p{L}\\p{Nl}", true],
  "[:ascii:]": ["\\x" + "00-\\x" + "7f", false],
  "[:blank:]": ["\\p{Zs}\\t", true],
  "[:cntrl:]": ["\\p{Cc}", true],
  "[:digit:]": ["\\p{Nd}", true],
  "[:graph:]": ["\\p{Z}\\p{C}", true, true],
  "[:lower:]": ["\\p{Ll}", true],
  "[:print:]": ["\\p{C}", true],
  "[:punct:]": ["\\p{P}", true],
  "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true],
  "[:upper:]": ["\\p{Lu}", true],
  "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true],
  "[:xdigit:]": ["A-Fa-f0-9", false]
};
var braceEscape = (s) => s.replace(/[[\]\\-]/g, "\\$&");
var regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var rangesToString = (ranges) => ranges.join("");
var parseClass = (glob, position) => {
  const pos = position;
  if (glob.charAt(pos) !== "[") {
    throw new Error("not in a brace expression");
  }
  const ranges = [];
  const negs = [];
  let i = pos + 1;
  let sawStart = false;
  let uflag = false;
  let escaping = false;
  let negate = false;
  let endPos = pos;
  let rangeStart = "";
  WHILE:
    while (i < glob.length) {
      const c = glob.charAt(i);
      if ((c === "!" || c === "^") && i === pos + 1) {
        negate = true;
        i++;
        continue;
      }
      if (c === "]" && sawStart && !escaping) {
        endPos = i + 1;
        break;
      }
      sawStart = true;
      if (c === "\\") {
        if (!escaping) {
          escaping = true;
          i++;
          continue;
        }
      }
      if (c === "[" && !escaping) {
        for (const [cls, [unip, u, neg]] of Object.entries(posixClasses)) {
          if (glob.startsWith(cls, i)) {
            if (rangeStart) {
              return ["$.", false, glob.length - pos, true];
            }
            i += cls.length;
            if (neg)
              negs.push(unip);
            else
              ranges.push(unip);
            uflag = uflag || u;
            continue WHILE;
          }
        }
      }
      escaping = false;
      if (rangeStart) {
        if (c > rangeStart) {
          ranges.push(braceEscape(rangeStart) + "-" + braceEscape(c));
        } else if (c === rangeStart) {
          ranges.push(braceEscape(c));
        }
        rangeStart = "";
        i++;
        continue;
      }
      if (glob.startsWith("-]", i + 1)) {
        ranges.push(braceEscape(c + "-"));
        i += 2;
        continue;
      }
      if (glob.startsWith("-", i + 1)) {
        rangeStart = c;
        i += 2;
        continue;
      }
      ranges.push(braceEscape(c));
      i++;
    }
  if (endPos < i) {
    return ["", false, 0, false];
  }
  if (!ranges.length && !negs.length) {
    return ["$.", false, glob.length - pos, true];
  }
  if (negs.length === 0 && ranges.length === 1 && /^\\?.$/.test(ranges[0]) && !negate) {
    const r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
    return [regexpEscape(r), false, endPos - pos, false];
  }
  const sranges = "[" + (negate ? "^" : "") + rangesToString(ranges) + "]";
  const snegs = "[" + (negate ? "" : "^") + rangesToString(negs) + "]";
  const comb = ranges.length && negs.length ? "(" + sranges + "|" + snegs + ")" : ranges.length ? sranges : snegs;
  return [comb, uflag, endPos - pos, true];
};

// node_modules/minimatch/dist/esm/unescape.js
var unescape = (s, { windowsPathsNoEscape = false } = {}) => {
  return windowsPathsNoEscape ? s.replace(/\[([^\/\\])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^\/\\])\]/g, "$1$2").replace(/\\([^\/])/g, "$1");
};

// node_modules/minimatch/dist/esm/ast.js
var _a;
var types = new Set(["!", "?", "+", "*", "@"]);
var isExtglobType = (c) => types.has(c);
var isExtglobAST = (c) => isExtglobType(c.type);
var adoptionMap = new Map([
  ["!", ["@"]],
  ["?", ["?", "@"]],
  ["@", ["@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@"]]
]);
var adoptionWithSpaceMap = new Map([
  ["!", ["?"]],
  ["@", ["?"]],
  ["+", ["?", "*"]]
]);
var adoptionAnyMap = new Map([
  ["!", ["?", "@"]],
  ["?", ["?", "@"]],
  ["@", ["?", "@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@", "?", "*"]]
]);
var usurpMap = new Map([
  ["!", new Map([["!", "@"]])],
  ["?", new Map([["*", "*"], ["+", "*"]])],
  ["@", new Map([["!", "!"], ["?", "?"], ["@", "@"], ["*", "*"], ["+", "+"]])],
  ["+", new Map([["?", "*"], ["*", "*"]])]
]);
var startNoTraversal = "(?!(?:^|/)\\.\\.?(?:$|/))";
var startNoDot = "(?!\\.)";
var addPatternStart = new Set(["[", "."]);
var justDots = new Set(["..", "."]);
var reSpecials = new Set("().*{}+?[]^$\\!");
var regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var qmark = "[^/]";
var star = qmark + "*?";
var starNoEmpty = qmark + "+?";

class AST {
  type;
  #root;
  #hasMagic;
  #uflag = false;
  #parts = [];
  #parent;
  #parentIndex;
  #negs;
  #filledNegs = false;
  #options;
  #toString;
  #emptyExt = false;
  constructor(type, parent, options = {}) {
    this.type = type;
    if (type)
      this.#hasMagic = true;
    this.#parent = parent;
    this.#root = this.#parent ? this.#parent.#root : this;
    this.#options = this.#root === this ? options : this.#root.#options;
    this.#negs = this.#root === this ? [] : this.#root.#negs;
    if (type === "!" && !this.#root.#filledNegs)
      this.#negs.push(this);
    this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
  }
  get hasMagic() {
    if (this.#hasMagic !== undefined)
      return this.#hasMagic;
    for (const p of this.#parts) {
      if (typeof p === "string")
        continue;
      if (p.type || p.hasMagic)
        return this.#hasMagic = true;
    }
    return this.#hasMagic;
  }
  toString() {
    if (this.#toString !== undefined)
      return this.#toString;
    if (!this.type) {
      return this.#toString = this.#parts.map((p) => String(p)).join("");
    } else {
      return this.#toString = this.type + "(" + this.#parts.map((p) => String(p)).join("|") + ")";
    }
  }
  #fillNegs() {
    if (this !== this.#root)
      throw new Error("should only call on root");
    if (this.#filledNegs)
      return this;
    this.toString();
    this.#filledNegs = true;
    let n2;
    while (n2 = this.#negs.pop()) {
      if (n2.type !== "!")
        continue;
      let p = n2;
      let pp = p.#parent;
      while (pp) {
        for (let i = p.#parentIndex + 1;!pp.type && i < pp.#parts.length; i++) {
          for (const part of n2.#parts) {
            if (typeof part === "string") {
              throw new Error("string part in extglob AST??");
            }
            part.copyIn(pp.#parts[i]);
          }
        }
        p = pp;
        pp = p.#parent;
      }
    }
    return this;
  }
  push(...parts) {
    for (const p of parts) {
      if (p === "")
        continue;
      if (typeof p !== "string" && !(p instanceof _a && p.#parent === this)) {
        throw new Error("invalid part: " + p);
      }
      this.#parts.push(p);
    }
  }
  toJSON() {
    const ret = this.type === null ? this.#parts.slice().map((p) => typeof p === "string" ? p : p.toJSON()) : [this.type, ...this.#parts.map((p) => p.toJSON())];
    if (this.isStart() && !this.type)
      ret.unshift([]);
    if (this.isEnd() && (this === this.#root || this.#root.#filledNegs && this.#parent?.type === "!")) {
      ret.push({});
    }
    return ret;
  }
  isStart() {
    if (this.#root === this)
      return true;
    if (!this.#parent?.isStart())
      return false;
    if (this.#parentIndex === 0)
      return true;
    const p = this.#parent;
    for (let i = 0;i < this.#parentIndex; i++) {
      const pp = p.#parts[i];
      if (!(pp instanceof _a && pp.type === "!")) {
        return false;
      }
    }
    return true;
  }
  isEnd() {
    if (this.#root === this)
      return true;
    if (this.#parent?.type === "!")
      return true;
    if (!this.#parent?.isEnd())
      return false;
    if (!this.type)
      return this.#parent?.isEnd();
    const pl = this.#parent ? this.#parent.#parts.length : 0;
    return this.#parentIndex === pl - 1;
  }
  copyIn(part) {
    if (typeof part === "string")
      this.push(part);
    else
      this.push(part.clone(this));
  }
  clone(parent) {
    const c = new _a(this.type, parent);
    for (const p of this.#parts) {
      c.copyIn(p);
    }
    return c;
  }
  static #parseAST(str, ast, pos, opt, extDepth) {
    const maxDepth = opt.maxExtglobRecursion ?? 2;
    let escaping = false;
    let inBrace = false;
    let braceStart = -1;
    let braceNeg = false;
    if (ast.type === null) {
      let i2 = pos;
      let acc2 = "";
      while (i2 < str.length) {
        const c = str.charAt(i2++);
        if (escaping || c === "\\") {
          escaping = !escaping;
          acc2 += c;
          continue;
        }
        if (inBrace) {
          if (i2 === braceStart + 1) {
            if (c === "^" || c === "!") {
              braceNeg = true;
            }
          } else if (c === "]" && !(i2 === braceStart + 2 && braceNeg)) {
            inBrace = false;
          }
          acc2 += c;
          continue;
        } else if (c === "[") {
          inBrace = true;
          braceStart = i2;
          braceNeg = false;
          acc2 += c;
          continue;
        }
        const doRecurse = !opt.noext && isExtglobType(c) && str.charAt(i2) === "(" && extDepth <= maxDepth;
        if (doRecurse) {
          ast.push(acc2);
          acc2 = "";
          const ext = new _a(c, ast);
          i2 = _a.#parseAST(str, ext, i2, opt, extDepth + 1);
          ast.push(ext);
          continue;
        }
        acc2 += c;
      }
      ast.push(acc2);
      return i2;
    }
    let i = pos + 1;
    let part = new _a(null, ast);
    const parts = [];
    let acc = "";
    while (i < str.length) {
      const c = str.charAt(i++);
      if (escaping || c === "\\") {
        escaping = !escaping;
        acc += c;
        continue;
      }
      if (inBrace) {
        if (i === braceStart + 1) {
          if (c === "^" || c === "!") {
            braceNeg = true;
          }
        } else if (c === "]" && !(i === braceStart + 2 && braceNeg)) {
          inBrace = false;
        }
        acc += c;
        continue;
      } else if (c === "[") {
        inBrace = true;
        braceStart = i;
        braceNeg = false;
        acc += c;
        continue;
      }
      const doRecurse = isExtglobType(c) && str.charAt(i) === "(" && (extDepth <= maxDepth || ast && ast.#canAdoptType(c));
      if (doRecurse) {
        const depthAdd = ast && ast.#canAdoptType(c) ? 0 : 1;
        part.push(acc);
        acc = "";
        const ext = new _a(c, part);
        part.push(ext);
        i = _a.#parseAST(str, ext, i, opt, extDepth + depthAdd);
        continue;
      }
      if (c === "|") {
        part.push(acc);
        acc = "";
        parts.push(part);
        part = new _a(null, ast);
        continue;
      }
      if (c === ")") {
        if (acc === "" && ast.#parts.length === 0) {
          ast.#emptyExt = true;
        }
        part.push(acc);
        acc = "";
        ast.push(...parts, part);
        return i;
      }
      acc += c;
    }
    ast.type = null;
    ast.#hasMagic = undefined;
    ast.#parts = [str.substring(pos - 1)];
    return i;
  }
  #canAdoptWithSpace(child) {
    return this.#canAdopt(child, adoptionWithSpaceMap);
  }
  #canAdopt(child, map = adoptionMap) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canAdoptType(gc.type, map);
  }
  #canAdoptType(c, map = adoptionAnyMap) {
    return !!map.get(this.type)?.includes(c);
  }
  #adoptWithSpace(child, index) {
    const gc = child.#parts[0];
    const blank = new _a(null, gc, this.options);
    blank.#parts.push("");
    gc.push(blank);
    this.#adopt(child, index);
  }
  #adopt(child, index) {
    const gc = child.#parts[0];
    this.#parts.splice(index, 1, ...gc.#parts);
    for (const p of gc.#parts) {
      if (typeof p === "object")
        p.#parent = this;
    }
    this.#toString = undefined;
  }
  #canUsurpType(c) {
    const m = usurpMap.get(this.type);
    return !!m?.has(c);
  }
  #canUsurp(child) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null || this.#parts.length !== 1) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canUsurpType(gc.type);
  }
  #usurp(child) {
    const m = usurpMap.get(this.type);
    const gc = child.#parts[0];
    const nt = m?.get(gc.type);
    if (!nt)
      return false;
    this.#parts = gc.#parts;
    for (const p of this.#parts) {
      if (typeof p === "object")
        p.#parent = this;
    }
    this.type = nt;
    this.#toString = undefined;
    this.#emptyExt = false;
  }
  #flatten() {
    if (!isExtglobAST(this)) {
      for (const p of this.#parts) {
        if (typeof p === "object")
          p.#flatten();
      }
    } else {
      let iterations = 0;
      let done = false;
      do {
        done = true;
        for (let i = 0;i < this.#parts.length; i++) {
          const c = this.#parts[i];
          if (typeof c === "object") {
            c.#flatten();
            if (this.#canAdopt(c)) {
              done = false;
              this.#adopt(c, i);
            } else if (this.#canAdoptWithSpace(c)) {
              done = false;
              this.#adoptWithSpace(c, i);
            } else if (this.#canUsurp(c)) {
              done = false;
              this.#usurp(c);
            }
          }
        }
      } while (!done && ++iterations < 10);
    }
    this.#toString = undefined;
  }
  static fromGlob(pattern, options = {}) {
    const ast = new _a(null, undefined, options);
    _a.#parseAST(pattern, ast, 0, options, 0);
    return ast;
  }
  toMMPattern() {
    if (this !== this.#root)
      return this.#root.toMMPattern();
    const glob = this.toString();
    const [re, body, hasMagic, uflag] = this.toRegExpSource();
    const anyMagic = hasMagic || this.#hasMagic || this.#options.nocase && !this.#options.nocaseMagicOnly && glob.toUpperCase() !== glob.toLowerCase();
    if (!anyMagic) {
      return body;
    }
    const flags = (this.#options.nocase ? "i" : "") + (uflag ? "u" : "");
    return Object.assign(new RegExp(`^${re}$`, flags), {
      _src: re,
      _glob: glob
    });
  }
  get options() {
    return this.#options;
  }
  toRegExpSource(allowDot) {
    const dot = allowDot ?? !!this.#options.dot;
    if (this.#root === this) {
      this.#flatten();
      this.#fillNegs();
    }
    if (!isExtglobAST(this)) {
      const noEmpty = this.isStart() && this.isEnd();
      const src = this.#parts.map((p) => {
        const [re, _, hasMagic, uflag] = typeof p === "string" ? _a.#parseGlob(p, this.#hasMagic, noEmpty) : p.toRegExpSource(allowDot);
        this.#hasMagic = this.#hasMagic || hasMagic;
        this.#uflag = this.#uflag || uflag;
        return re;
      }).join("");
      let start2 = "";
      if (this.isStart()) {
        if (typeof this.#parts[0] === "string") {
          const dotTravAllowed = this.#parts.length === 1 && justDots.has(this.#parts[0]);
          if (!dotTravAllowed) {
            const aps = addPatternStart;
            const needNoTrav = dot && aps.has(src.charAt(0)) || src.startsWith("\\.") && aps.has(src.charAt(2)) || src.startsWith("\\.\\.") && aps.has(src.charAt(4));
            const needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
            start2 = needNoTrav ? startNoTraversal : needNoDot ? startNoDot : "";
          }
        }
      }
      let end = "";
      if (this.isEnd() && this.#root.#filledNegs && this.#parent?.type === "!") {
        end = "(?:$|\\/)";
      }
      const final2 = start2 + src + end;
      return [
        final2,
        unescape(src),
        this.#hasMagic = !!this.#hasMagic,
        this.#uflag
      ];
    }
    const repeated = this.type === "*" || this.type === "+";
    const start = this.type === "!" ? "(?:(?!(?:" : "(?:";
    let body = this.#partsToRegExp(dot);
    if (this.isStart() && this.isEnd() && !body && this.type !== "!") {
      const s = this.toString();
      const me = this;
      me.#parts = [s];
      me.type = null;
      me.#hasMagic = undefined;
      return [s, unescape(this.toString()), false, false];
    }
    let bodyDotAllowed = !repeated || allowDot || dot || !startNoDot ? "" : this.#partsToRegExp(true);
    if (bodyDotAllowed === body) {
      bodyDotAllowed = "";
    }
    if (bodyDotAllowed) {
      body = `(?:${body})(?:${bodyDotAllowed})*?`;
    }
    let final = "";
    if (this.type === "!" && this.#emptyExt) {
      final = (this.isStart() && !dot ? startNoDot : "") + starNoEmpty;
    } else {
      const close = this.type === "!" ? "))" + (this.isStart() && !dot && !allowDot ? startNoDot : "") + star + ")" : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && bodyDotAllowed ? ")" : this.type === "*" && bodyDotAllowed ? `)?` : `)${this.type}`;
      final = start + body + close;
    }
    return [
      final,
      unescape(body),
      this.#hasMagic = !!this.#hasMagic,
      this.#uflag
    ];
  }
  #partsToRegExp(dot) {
    return this.#parts.map((p) => {
      if (typeof p === "string") {
        throw new Error("string type in extglob ast??");
      }
      const [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
      this.#uflag = this.#uflag || uflag;
      return re;
    }).filter((p) => !(this.isStart() && this.isEnd()) || !!p).join("|");
  }
  static #parseGlob(glob, hasMagic, noEmpty = false) {
    let escaping = false;
    let re = "";
    let uflag = false;
    let inStar = false;
    for (let i = 0;i < glob.length; i++) {
      const c = glob.charAt(i);
      if (escaping) {
        escaping = false;
        re += (reSpecials.has(c) ? "\\" : "") + c;
        inStar = false;
        continue;
      }
      if (c === "\\") {
        if (i === glob.length - 1) {
          re += "\\\\";
        } else {
          escaping = true;
        }
        continue;
      }
      if (c === "[") {
        const [src, needUflag, consumed, magic] = parseClass(glob, i);
        if (consumed) {
          re += src;
          uflag = uflag || needUflag;
          i += consumed - 1;
          hasMagic = hasMagic || magic;
          inStar = false;
          continue;
        }
      }
      if (c === "*") {
        if (inStar)
          continue;
        inStar = true;
        re += noEmpty && /^[*]+$/.test(glob) ? starNoEmpty : star;
        hasMagic = true;
        continue;
      } else {
        inStar = false;
      }
      if (c === "?") {
        re += qmark;
        hasMagic = true;
        continue;
      }
      re += regExpEscape(c);
    }
    return [re, unescape(glob), !!hasMagic, uflag];
  }
}
_a = AST;

// node_modules/minimatch/dist/esm/escape.js
var escape = (s, { windowsPathsNoEscape = false } = {}) => {
  return windowsPathsNoEscape ? s.replace(/[?*()[\]]/g, "[$&]") : s.replace(/[?*()[\]\\]/g, "\\$&");
};

// node_modules/minimatch/dist/esm/index.js
var minimatch = (p, pattern, options = {}) => {
  assertValidPattern(pattern);
  if (!options.nocomment && pattern.charAt(0) === "#") {
    return false;
  }
  return new Minimatch(pattern, options).match(p);
};
var starDotExtRE = /^\*+([^+@!?\*\[\(]*)$/;
var starDotExtTest = (ext) => (f) => !f.startsWith(".") && f.endsWith(ext);
var starDotExtTestDot = (ext) => (f) => f.endsWith(ext);
var starDotExtTestNocase = (ext) => {
  ext = ext.toLowerCase();
  return (f) => !f.startsWith(".") && f.toLowerCase().endsWith(ext);
};
var starDotExtTestNocaseDot = (ext) => {
  ext = ext.toLowerCase();
  return (f) => f.toLowerCase().endsWith(ext);
};
var starDotStarRE = /^\*+\.\*+$/;
var starDotStarTest = (f) => !f.startsWith(".") && f.includes(".");
var starDotStarTestDot = (f) => f !== "." && f !== ".." && f.includes(".");
var dotStarRE = /^\.\*+$/;
var dotStarTest = (f) => f !== "." && f !== ".." && f.startsWith(".");
var starRE = /^\*+$/;
var starTest = (f) => f.length !== 0 && !f.startsWith(".");
var starTestDot = (f) => f.length !== 0 && f !== "." && f !== "..";
var qmarksRE = /^\?+([^+@!?\*\[\(]*)?$/;
var qmarksTestNocase = ([$0, ext = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  if (!ext)
    return noext;
  ext = ext.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
var qmarksTestNocaseDot = ([$0, ext = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  if (!ext)
    return noext;
  ext = ext.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
var qmarksTestDot = ([$0, ext = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
var qmarksTest = ([$0, ext = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
var qmarksTestNoExt = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && !f.startsWith(".");
};
var qmarksTestNoExtDot = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && f !== "." && f !== "..";
};
var defaultPlatform = typeof process === "object" && process ? typeof process.env === "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
var path = {
  win32: { sep: "\\" },
  posix: { sep: "/" }
};
var sep2 = defaultPlatform === "win32" ? path.win32.sep : path.posix.sep;
minimatch.sep = sep2;
var GLOBSTAR = Symbol("globstar **");
minimatch.GLOBSTAR = GLOBSTAR;
var qmark2 = "[^/]";
var star2 = qmark2 + "*?";
var twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
var twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?";
var filter = (pattern, options = {}) => (p) => minimatch(p, pattern, options);
minimatch.filter = filter;
var ext = (a, b = {}) => Object.assign({}, a, b);
var defaults = (def) => {
  if (!def || typeof def !== "object" || !Object.keys(def).length) {
    return minimatch;
  }
  const orig = minimatch;
  const m = (p, pattern, options = {}) => orig(p, pattern, ext(def, options));
  return Object.assign(m, {
    Minimatch: class Minimatch extends orig.Minimatch {
      constructor(pattern, options = {}) {
        super(pattern, ext(def, options));
      }
      static defaults(options) {
        return orig.defaults(ext(def, options)).Minimatch;
      }
    },
    AST: class AST2 extends orig.AST {
      constructor(type, parent, options = {}) {
        super(type, parent, ext(def, options));
      }
      static fromGlob(pattern, options = {}) {
        return orig.AST.fromGlob(pattern, ext(def, options));
      }
    },
    unescape: (s, options = {}) => orig.unescape(s, ext(def, options)),
    escape: (s, options = {}) => orig.escape(s, ext(def, options)),
    filter: (pattern, options = {}) => orig.filter(pattern, ext(def, options)),
    defaults: (options) => orig.defaults(ext(def, options)),
    makeRe: (pattern, options = {}) => orig.makeRe(pattern, ext(def, options)),
    braceExpand: (pattern, options = {}) => orig.braceExpand(pattern, ext(def, options)),
    match: (list, pattern, options = {}) => orig.match(list, pattern, ext(def, options)),
    sep: orig.sep,
    GLOBSTAR
  });
};
minimatch.defaults = defaults;
var braceExpand = (pattern, options = {}) => {
  assertValidPattern(pattern);
  if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
    return [pattern];
  }
  return import_brace_expansion.default(pattern);
};
minimatch.braceExpand = braceExpand;
var makeRe = (pattern, options = {}) => new Minimatch(pattern, options).makeRe();
minimatch.makeRe = makeRe;
var match = (list, pattern, options = {}) => {
  const mm = new Minimatch(pattern, options);
  list = list.filter((f) => mm.match(f));
  if (mm.options.nonull && !list.length) {
    list.push(pattern);
  }
  return list;
};
minimatch.match = match;
var globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/;
var regExpEscape2 = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

class Minimatch {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  maxGlobstarRecursion;
  regexp;
  constructor(pattern, options = {}) {
    assertValidPattern(pattern);
    options = options || {};
    this.options = options;
    this.maxGlobstarRecursion = options.maxGlobstarRecursion ?? 200;
    this.pattern = pattern;
    this.platform = options.platform || defaultPlatform;
    this.isWindows = this.platform === "win32";
    this.windowsPathsNoEscape = !!options.windowsPathsNoEscape || options.allowWindowsEscape === false;
    if (this.windowsPathsNoEscape) {
      this.pattern = this.pattern.replace(/\\/g, "/");
    }
    this.preserveMultipleSlashes = !!options.preserveMultipleSlashes;
    this.regexp = null;
    this.negate = false;
    this.nonegate = !!options.nonegate;
    this.comment = false;
    this.empty = false;
    this.partial = !!options.partial;
    this.nocase = !!this.options.nocase;
    this.windowsNoMagicRoot = options.windowsNoMagicRoot !== undefined ? options.windowsNoMagicRoot : !!(this.isWindows && this.nocase);
    this.globSet = [];
    this.globParts = [];
    this.set = [];
    this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1) {
      return true;
    }
    for (const pattern of this.set) {
      for (const part of pattern) {
        if (typeof part !== "string")
          return true;
      }
    }
    return false;
  }
  debug(..._) {}
  make() {
    const pattern = this.pattern;
    const options = this.options;
    if (!options.nocomment && pattern.charAt(0) === "#") {
      this.comment = true;
      return;
    }
    if (!pattern) {
      this.empty = true;
      return;
    }
    this.parseNegate();
    this.globSet = [...new Set(this.braceExpand())];
    if (options.debug) {
      this.debug = (...args) => console.error(...args);
    }
    this.debug(this.pattern, this.globSet);
    const rawGlobParts = this.globSet.map((s) => this.slashSplit(s));
    this.globParts = this.preprocess(rawGlobParts);
    this.debug(this.pattern, this.globParts);
    let set = this.globParts.map((s, _, __) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        const isUNC = s[0] === "" && s[1] === "" && (s[2] === "?" || !globMagic.test(s[2])) && !globMagic.test(s[3]);
        const isDrive = /^[a-z]:/i.test(s[0]);
        if (isUNC) {
          return [...s.slice(0, 4), ...s.slice(4).map((ss) => this.parse(ss))];
        } else if (isDrive) {
          return [s[0], ...s.slice(1).map((ss) => this.parse(ss))];
        }
      }
      return s.map((ss) => this.parse(ss));
    });
    this.debug(this.pattern, set);
    this.set = set.filter((s) => s.indexOf(false) === -1);
    if (this.isWindows) {
      for (let i = 0;i < this.set.length; i++) {
        const p = this.set[i];
        if (p[0] === "" && p[1] === "" && this.globParts[i][2] === "?" && typeof p[3] === "string" && /^[a-z]:$/i.test(p[3])) {
          p[2] = "?";
        }
      }
    }
    this.debug(this.pattern, this.set);
  }
  preprocess(globParts) {
    if (this.options.noglobstar) {
      for (let i = 0;i < globParts.length; i++) {
        for (let j = 0;j < globParts[i].length; j++) {
          if (globParts[i][j] === "**") {
            globParts[i][j] = "*";
          }
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      globParts = this.firstPhasePreProcess(globParts);
      globParts = this.secondPhasePreProcess(globParts);
    } else if (optimizationLevel >= 1) {
      globParts = this.levelOneOptimize(globParts);
    } else {
      globParts = this.adjascentGlobstarOptimize(globParts);
    }
    return globParts;
  }
  adjascentGlobstarOptimize(globParts) {
    return globParts.map((parts) => {
      let gs = -1;
      while ((gs = parts.indexOf("**", gs + 1)) !== -1) {
        let i = gs;
        while (parts[i + 1] === "**") {
          i++;
        }
        if (i !== gs) {
          parts.splice(gs, i - gs);
        }
      }
      return parts;
    });
  }
  levelOneOptimize(globParts) {
    return globParts.map((parts) => {
      parts = parts.reduce((set, part) => {
        const prev = set[set.length - 1];
        if (part === "**" && prev === "**") {
          return set;
        }
        if (part === "..") {
          if (prev && prev !== ".." && prev !== "." && prev !== "**") {
            set.pop();
            return set;
          }
        }
        set.push(part);
        return set;
      }, []);
      return parts.length === 0 ? [""] : parts;
    });
  }
  levelTwoFileOptimize(parts) {
    if (!Array.isArray(parts)) {
      parts = this.slashSplit(parts);
    }
    let didSomething = false;
    do {
      didSomething = false;
      if (!this.preserveMultipleSlashes) {
        for (let i = 1;i < parts.length - 1; i++) {
          const p = parts[i];
          if (i === 1 && p === "" && parts[0] === "")
            continue;
          if (p === "." || p === "") {
            didSomething = true;
            parts.splice(i, 1);
            i--;
          }
        }
        if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
          didSomething = true;
          parts.pop();
        }
      }
      let dd = 0;
      while ((dd = parts.indexOf("..", dd + 1)) !== -1) {
        const p = parts[dd - 1];
        if (p && p !== "." && p !== ".." && p !== "**") {
          didSomething = true;
          parts.splice(dd - 1, 2);
          dd -= 2;
        }
      }
    } while (didSomething);
    return parts.length === 0 ? [""] : parts;
  }
  firstPhasePreProcess(globParts) {
    let didSomething = false;
    do {
      didSomething = false;
      for (let parts of globParts) {
        let gs = -1;
        while ((gs = parts.indexOf("**", gs + 1)) !== -1) {
          let gss = gs;
          while (parts[gss + 1] === "**") {
            gss++;
          }
          if (gss > gs) {
            parts.splice(gs + 1, gss - gs);
          }
          let next = parts[gs + 1];
          const p = parts[gs + 2];
          const p2 = parts[gs + 3];
          if (next !== "..")
            continue;
          if (!p || p === "." || p === ".." || !p2 || p2 === "." || p2 === "..") {
            continue;
          }
          didSomething = true;
          parts.splice(gs, 1);
          const other = parts.slice(0);
          other[gs] = "**";
          globParts.push(other);
          gs--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let i = 1;i < parts.length - 1; i++) {
            const p = parts[i];
            if (i === 1 && p === "" && parts[0] === "")
              continue;
            if (p === "." || p === "") {
              didSomething = true;
              parts.splice(i, 1);
              i--;
            }
          }
          if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
            didSomething = true;
            parts.pop();
          }
        }
        let dd = 0;
        while ((dd = parts.indexOf("..", dd + 1)) !== -1) {
          const p = parts[dd - 1];
          if (p && p !== "." && p !== ".." && p !== "**") {
            didSomething = true;
            const needDot = dd === 1 && parts[dd + 1] === "**";
            const splin = needDot ? ["."] : [];
            parts.splice(dd - 1, 2, ...splin);
            if (parts.length === 0)
              parts.push("");
            dd -= 2;
          }
        }
      }
    } while (didSomething);
    return globParts;
  }
  secondPhasePreProcess(globParts) {
    for (let i = 0;i < globParts.length - 1; i++) {
      for (let j = i + 1;j < globParts.length; j++) {
        const matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
        if (matched) {
          globParts[i] = [];
          globParts[j] = matched;
          break;
        }
      }
    }
    return globParts.filter((gs) => gs.length);
  }
  partsMatch(a, b, emptyGSMatch = false) {
    let ai = 0;
    let bi = 0;
    let result = [];
    let which = "";
    while (ai < a.length && bi < b.length) {
      if (a[ai] === b[bi]) {
        result.push(which === "b" ? b[bi] : a[ai]);
        ai++;
        bi++;
      } else if (emptyGSMatch && a[ai] === "**" && b[bi] === a[ai + 1]) {
        result.push(a[ai]);
        ai++;
      } else if (emptyGSMatch && b[bi] === "**" && a[ai] === b[bi + 1]) {
        result.push(b[bi]);
        bi++;
      } else if (a[ai] === "*" && b[bi] && (this.options.dot || !b[bi].startsWith(".")) && b[bi] !== "**") {
        if (which === "b")
          return false;
        which = "a";
        result.push(a[ai]);
        ai++;
        bi++;
      } else if (b[bi] === "*" && a[ai] && (this.options.dot || !a[ai].startsWith(".")) && a[ai] !== "**") {
        if (which === "a")
          return false;
        which = "b";
        result.push(b[bi]);
        ai++;
        bi++;
      } else {
        return false;
      }
    }
    return a.length === b.length && result;
  }
  parseNegate() {
    if (this.nonegate)
      return;
    const pattern = this.pattern;
    let negate = false;
    let negateOffset = 0;
    for (let i = 0;i < pattern.length && pattern.charAt(i) === "!"; i++) {
      negate = !negate;
      negateOffset++;
    }
    if (negateOffset)
      this.pattern = pattern.slice(negateOffset);
    this.negate = negate;
  }
  matchOne(file, pattern, partial = false) {
    let fileStartIndex = 0;
    let patternStartIndex = 0;
    if (this.isWindows) {
      const fileDrive = typeof file[0] === "string" && /^[a-z]:$/i.test(file[0]);
      const fileUNC = !fileDrive && file[0] === "" && file[1] === "" && file[2] === "?" && /^[a-z]:$/i.test(file[3]);
      const patternDrive = typeof pattern[0] === "string" && /^[a-z]:$/i.test(pattern[0]);
      const patternUNC = !patternDrive && pattern[0] === "" && pattern[1] === "" && pattern[2] === "?" && typeof pattern[3] === "string" && /^[a-z]:$/i.test(pattern[3]);
      const fdi = fileUNC ? 3 : fileDrive ? 0 : undefined;
      const pdi = patternUNC ? 3 : patternDrive ? 0 : undefined;
      if (typeof fdi === "number" && typeof pdi === "number") {
        const [fd, pd] = [
          file[fdi],
          pattern[pdi]
        ];
        if (fd.toLowerCase() === pd.toLowerCase()) {
          pattern[pdi] = fd;
          patternStartIndex = pdi;
          fileStartIndex = fdi;
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      file = this.levelTwoFileOptimize(file);
    }
    if (pattern.includes(GLOBSTAR)) {
      return this.#matchGlobstar(file, pattern, partial, fileStartIndex, patternStartIndex);
    }
    return this.#matchOne(file, pattern, partial, fileStartIndex, patternStartIndex);
  }
  #matchGlobstar(file, pattern, partial, fileIndex, patternIndex) {
    const firstgs = pattern.indexOf(GLOBSTAR, patternIndex);
    const lastgs = pattern.lastIndexOf(GLOBSTAR);
    const [head, body, tail] = partial ? [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1),
      []
    ] : [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1, lastgs),
      pattern.slice(lastgs + 1)
    ];
    if (head.length) {
      const fileHead = file.slice(fileIndex, fileIndex + head.length);
      if (!this.#matchOne(fileHead, head, partial, 0, 0))
        return false;
      fileIndex += head.length;
    }
    let fileTailMatch = 0;
    if (tail.length) {
      if (tail.length + fileIndex > file.length)
        return false;
      let tailStart = file.length - tail.length;
      if (this.#matchOne(file, tail, partial, tailStart, 0)) {
        fileTailMatch = tail.length;
      } else {
        if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) {
          return false;
        }
        tailStart--;
        if (!this.#matchOne(file, tail, partial, tailStart, 0))
          return false;
        fileTailMatch = tail.length + 1;
      }
    }
    if (!body.length) {
      let sawSome = !!fileTailMatch;
      for (let i2 = fileIndex;i2 < file.length - fileTailMatch; i2++) {
        const f = String(file[i2]);
        sawSome = true;
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return partial || sawSome;
    }
    const bodySegments = [[[], 0]];
    let currentBody = bodySegments[0];
    let nonGsParts = 0;
    const nonGsPartsSums = [0];
    for (const b of body) {
      if (b === GLOBSTAR) {
        nonGsPartsSums.push(nonGsParts);
        currentBody = [[], 0];
        bodySegments.push(currentBody);
      } else {
        currentBody[0].push(b);
        nonGsParts++;
      }
    }
    let i = bodySegments.length - 1;
    const fileLength = file.length - fileTailMatch;
    for (const b of bodySegments) {
      b[1] = fileLength - (nonGsPartsSums[i--] + b[0].length);
    }
    return !!this.#matchGlobStarBodySections(file, bodySegments, fileIndex, 0, partial, 0, !!fileTailMatch);
  }
  #matchGlobStarBodySections(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
    const bs = bodySegments[bodyIndex];
    if (!bs) {
      for (let i = fileIndex;i < file.length; i++) {
        sawTail = true;
        const f = file[i];
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return sawTail;
    }
    const [body, after] = bs;
    while (fileIndex <= after) {
      const m = this.#matchOne(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0);
      if (m && globStarDepth < this.maxGlobstarRecursion) {
        const sub = this.#matchGlobStarBodySections(file, bodySegments, fileIndex + body.length, bodyIndex + 1, partial, globStarDepth + 1, sawTail);
        if (sub !== false)
          return sub;
      }
      const f = file[fileIndex];
      if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
        return false;
      }
      fileIndex++;
    }
    return partial || null;
  }
  #matchOne(file, pattern, partial, fileIndex, patternIndex) {
    let fi;
    let pi;
    let pl;
    let fl;
    for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length;fi < fl && pi < pl; fi++, pi++) {
      this.debug("matchOne loop");
      let p = pattern[pi];
      let f = file[fi];
      this.debug(pattern, p, f);
      if (p === false || p === GLOBSTAR)
        return false;
      let hit;
      if (typeof p === "string") {
        hit = f === p;
        this.debug("string match", p, f, hit);
      } else {
        hit = p.test(f);
        this.debug("pattern match", p, f, hit);
      }
      if (!hit)
        return false;
    }
    if (fi === fl && pi === pl) {
      return true;
    } else if (fi === fl) {
      return partial;
    } else if (pi === pl) {
      return fi === fl - 1 && file[fi] === "";
    } else {
      throw new Error("wtf?");
    }
  }
  braceExpand() {
    return braceExpand(this.pattern, this.options);
  }
  parse(pattern) {
    assertValidPattern(pattern);
    const options = this.options;
    if (pattern === "**")
      return GLOBSTAR;
    if (pattern === "")
      return "";
    let m;
    let fastTest = null;
    if (m = pattern.match(starRE)) {
      fastTest = options.dot ? starTestDot : starTest;
    } else if (m = pattern.match(starDotExtRE)) {
      fastTest = (options.nocase ? options.dot ? starDotExtTestNocaseDot : starDotExtTestNocase : options.dot ? starDotExtTestDot : starDotExtTest)(m[1]);
    } else if (m = pattern.match(qmarksRE)) {
      fastTest = (options.nocase ? options.dot ? qmarksTestNocaseDot : qmarksTestNocase : options.dot ? qmarksTestDot : qmarksTest)(m);
    } else if (m = pattern.match(starDotStarRE)) {
      fastTest = options.dot ? starDotStarTestDot : starDotStarTest;
    } else if (m = pattern.match(dotStarRE)) {
      fastTest = dotStarTest;
    }
    const re = AST.fromGlob(pattern, this.options).toMMPattern();
    if (fastTest && typeof re === "object") {
      Reflect.defineProperty(re, "test", { value: fastTest });
    }
    return re;
  }
  makeRe() {
    if (this.regexp || this.regexp === false)
      return this.regexp;
    const set = this.set;
    if (!set.length) {
      this.regexp = false;
      return this.regexp;
    }
    const options = this.options;
    const twoStar = options.noglobstar ? star2 : options.dot ? twoStarDot : twoStarNoDot;
    const flags = new Set(options.nocase ? ["i"] : []);
    let re = set.map((pattern) => {
      const pp = pattern.map((p) => {
        if (p instanceof RegExp) {
          for (const f of p.flags.split(""))
            flags.add(f);
        }
        return typeof p === "string" ? regExpEscape2(p) : p === GLOBSTAR ? GLOBSTAR : p._src;
      });
      pp.forEach((p, i) => {
        const next = pp[i + 1];
        const prev = pp[i - 1];
        if (p !== GLOBSTAR || prev === GLOBSTAR) {
          return;
        }
        if (prev === undefined) {
          if (next !== undefined && next !== GLOBSTAR) {
            pp[i + 1] = "(?:\\/|" + twoStar + "\\/)?" + next;
          } else {
            pp[i] = twoStar;
          }
        } else if (next === undefined) {
          pp[i - 1] = prev + "(?:\\/|" + twoStar + ")?";
        } else if (next !== GLOBSTAR) {
          pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + "\\/)" + next;
          pp[i + 1] = GLOBSTAR;
        }
      });
      return pp.filter((p) => p !== GLOBSTAR).join("/");
    }).join("|");
    const [open, close] = set.length > 1 ? ["(?:", ")"] : ["", ""];
    re = "^" + open + re + close + "$";
    if (this.negate)
      re = "^(?!" + re + ").+$";
    try {
      this.regexp = new RegExp(re, [...flags].join(""));
    } catch (ex) {
      this.regexp = false;
    }
    return this.regexp;
  }
  slashSplit(p) {
    if (this.preserveMultipleSlashes) {
      return p.split("/");
    } else if (this.isWindows && /^\/\/[^\/]+/.test(p)) {
      return ["", ...p.split(/\/+/)];
    } else {
      return p.split(/\/+/);
    }
  }
  match(f, partial = this.partial) {
    this.debug("match", f, this.pattern);
    if (this.comment) {
      return false;
    }
    if (this.empty) {
      return f === "";
    }
    if (f === "/" && partial) {
      return true;
    }
    const options = this.options;
    if (this.isWindows) {
      f = f.split("\\").join("/");
    }
    const ff = this.slashSplit(f);
    this.debug(this.pattern, "split", ff);
    const set = this.set;
    this.debug(this.pattern, "set", set);
    let filename = ff[ff.length - 1];
    if (!filename) {
      for (let i = ff.length - 2;!filename && i >= 0; i--) {
        filename = ff[i];
      }
    }
    for (let i = 0;i < set.length; i++) {
      const pattern = set[i];
      let file = ff;
      if (options.matchBase && pattern.length === 1) {
        file = [filename];
      }
      const hit = this.matchOne(file, pattern, partial);
      if (hit) {
        if (options.flipNegate) {
          return true;
        }
        return !this.negate;
      }
    }
    if (options.flipNegate) {
      return false;
    }
    return this.negate;
  }
  static defaults(def) {
    return minimatch.defaults(def).Minimatch;
  }
}
minimatch.AST = AST;
minimatch.Minimatch = Minimatch;
minimatch.escape = escape;
minimatch.unescape = unescape;

// node_modules/glob/dist/esm/glob.js
import { fileURLToPath as fileURLToPath2 } from "node:url";

// node_modules/lru-cache/dist/esm/index.js
var perf = typeof performance === "object" && performance && typeof performance.now === "function" ? performance : Date;
var warned = new Set;
var PROCESS = typeof process === "object" && !!process ? process : {};
var emitWarning = (msg, type, code, fn) => {
  typeof PROCESS.emitWarning === "function" ? PROCESS.emitWarning(msg, type, code, fn) : console.error(`[${code}] ${type}: ${msg}`);
};
var AC = globalThis.AbortController;
var AS = globalThis.AbortSignal;
if (typeof AC === "undefined") {
  AS = class AbortSignal {
    onabort;
    _onabort = [];
    reason;
    aborted = false;
    addEventListener(_, fn) {
      this._onabort.push(fn);
    }
  };
  AC = class AbortController2 {
    constructor() {
      warnACPolyfill();
    }
    signal = new AS;
    abort(reason) {
      if (this.signal.aborted)
        return;
      this.signal.reason = reason;
      this.signal.aborted = true;
      for (const fn of this.signal._onabort) {
        fn(reason);
      }
      this.signal.onabort?.(reason);
    }
  };
  let printACPolyfillWarning = PROCESS.env?.LRU_CACHE_IGNORE_AC_WARNING !== "1";
  const warnACPolyfill = () => {
    if (!printACPolyfillWarning)
      return;
    printACPolyfillWarning = false;
    emitWarning("AbortController is not defined. If using lru-cache in " + "node 14, load an AbortController polyfill from the " + "`node-abort-controller` package. A minimal polyfill is " + "provided for use by LRUCache.fetch(), but it should not be " + "relied upon in other contexts (eg, passing it to other APIs that " + "use AbortController/AbortSignal might have undesirable effects). " + "You may disable this with LRU_CACHE_IGNORE_AC_WARNING=1 in the env.", "NO_ABORT_CONTROLLER", "ENOTSUP", warnACPolyfill);
  };
}
var shouldWarn = (code) => !warned.has(code);
var TYPE = Symbol("type");
var isPosInt = (n2) => n2 && n2 === Math.floor(n2) && n2 > 0 && isFinite(n2);
var getUintArray = (max) => !isPosInt(max) ? null : max <= Math.pow(2, 8) ? Uint8Array : max <= Math.pow(2, 16) ? Uint16Array : max <= Math.pow(2, 32) ? Uint32Array : max <= Number.MAX_SAFE_INTEGER ? ZeroArray : null;

class ZeroArray extends Array {
  constructor(size) {
    super(size);
    this.fill(0);
  }
}

class Stack {
  heap;
  length;
  static #constructing = false;
  static create(max) {
    const HeapCls = getUintArray(max);
    if (!HeapCls)
      return [];
    Stack.#constructing = true;
    const s = new Stack(max, HeapCls);
    Stack.#constructing = false;
    return s;
  }
  constructor(max, HeapCls) {
    if (!Stack.#constructing) {
      throw new TypeError("instantiate Stack using Stack.create(n)");
    }
    this.heap = new HeapCls(max);
    this.length = 0;
  }
  push(n2) {
    this.heap[this.length++] = n2;
  }
  pop() {
    return this.heap[--this.length];
  }
}

class LRUCache {
  #max;
  #maxSize;
  #dispose;
  #disposeAfter;
  #fetchMethod;
  #memoMethod;
  ttl;
  ttlResolution;
  ttlAutopurge;
  updateAgeOnGet;
  updateAgeOnHas;
  allowStale;
  noDisposeOnSet;
  noUpdateTTL;
  maxEntrySize;
  sizeCalculation;
  noDeleteOnFetchRejection;
  noDeleteOnStaleGet;
  allowStaleOnFetchAbort;
  allowStaleOnFetchRejection;
  ignoreFetchAbort;
  #size;
  #calculatedSize;
  #keyMap;
  #keyList;
  #valList;
  #next;
  #prev;
  #head;
  #tail;
  #free;
  #disposed;
  #sizes;
  #starts;
  #ttls;
  #hasDispose;
  #hasFetchMethod;
  #hasDisposeAfter;
  static unsafeExposeInternals(c) {
    return {
      starts: c.#starts,
      ttls: c.#ttls,
      sizes: c.#sizes,
      keyMap: c.#keyMap,
      keyList: c.#keyList,
      valList: c.#valList,
      next: c.#next,
      prev: c.#prev,
      get head() {
        return c.#head;
      },
      get tail() {
        return c.#tail;
      },
      free: c.#free,
      isBackgroundFetch: (p) => c.#isBackgroundFetch(p),
      backgroundFetch: (k, index, options, context) => c.#backgroundFetch(k, index, options, context),
      moveToTail: (index) => c.#moveToTail(index),
      indexes: (options) => c.#indexes(options),
      rindexes: (options) => c.#rindexes(options),
      isStale: (index) => c.#isStale(index)
    };
  }
  get max() {
    return this.#max;
  }
  get maxSize() {
    return this.#maxSize;
  }
  get calculatedSize() {
    return this.#calculatedSize;
  }
  get size() {
    return this.#size;
  }
  get fetchMethod() {
    return this.#fetchMethod;
  }
  get memoMethod() {
    return this.#memoMethod;
  }
  get dispose() {
    return this.#dispose;
  }
  get disposeAfter() {
    return this.#disposeAfter;
  }
  constructor(options) {
    const { max = 0, ttl, ttlResolution = 1, ttlAutopurge, updateAgeOnGet, updateAgeOnHas, allowStale, dispose, disposeAfter, noDisposeOnSet, noUpdateTTL, maxSize = 0, maxEntrySize = 0, sizeCalculation, fetchMethod, memoMethod, noDeleteOnFetchRejection, noDeleteOnStaleGet, allowStaleOnFetchRejection, allowStaleOnFetchAbort, ignoreFetchAbort } = options;
    if (max !== 0 && !isPosInt(max)) {
      throw new TypeError("max option must be a nonnegative integer");
    }
    const UintArray = max ? getUintArray(max) : Array;
    if (!UintArray) {
      throw new Error("invalid max value: " + max);
    }
    this.#max = max;
    this.#maxSize = maxSize;
    this.maxEntrySize = maxEntrySize || this.#maxSize;
    this.sizeCalculation = sizeCalculation;
    if (this.sizeCalculation) {
      if (!this.#maxSize && !this.maxEntrySize) {
        throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");
      }
      if (typeof this.sizeCalculation !== "function") {
        throw new TypeError("sizeCalculation set to non-function");
      }
    }
    if (memoMethod !== undefined && typeof memoMethod !== "function") {
      throw new TypeError("memoMethod must be a function if defined");
    }
    this.#memoMethod = memoMethod;
    if (fetchMethod !== undefined && typeof fetchMethod !== "function") {
      throw new TypeError("fetchMethod must be a function if specified");
    }
    this.#fetchMethod = fetchMethod;
    this.#hasFetchMethod = !!fetchMethod;
    this.#keyMap = new Map;
    this.#keyList = new Array(max).fill(undefined);
    this.#valList = new Array(max).fill(undefined);
    this.#next = new UintArray(max);
    this.#prev = new UintArray(max);
    this.#head = 0;
    this.#tail = 0;
    this.#free = Stack.create(max);
    this.#size = 0;
    this.#calculatedSize = 0;
    if (typeof dispose === "function") {
      this.#dispose = dispose;
    }
    if (typeof disposeAfter === "function") {
      this.#disposeAfter = disposeAfter;
      this.#disposed = [];
    } else {
      this.#disposeAfter = undefined;
      this.#disposed = undefined;
    }
    this.#hasDispose = !!this.#dispose;
    this.#hasDisposeAfter = !!this.#disposeAfter;
    this.noDisposeOnSet = !!noDisposeOnSet;
    this.noUpdateTTL = !!noUpdateTTL;
    this.noDeleteOnFetchRejection = !!noDeleteOnFetchRejection;
    this.allowStaleOnFetchRejection = !!allowStaleOnFetchRejection;
    this.allowStaleOnFetchAbort = !!allowStaleOnFetchAbort;
    this.ignoreFetchAbort = !!ignoreFetchAbort;
    if (this.maxEntrySize !== 0) {
      if (this.#maxSize !== 0) {
        if (!isPosInt(this.#maxSize)) {
          throw new TypeError("maxSize must be a positive integer if specified");
        }
      }
      if (!isPosInt(this.maxEntrySize)) {
        throw new TypeError("maxEntrySize must be a positive integer if specified");
      }
      this.#initializeSizeTracking();
    }
    this.allowStale = !!allowStale;
    this.noDeleteOnStaleGet = !!noDeleteOnStaleGet;
    this.updateAgeOnGet = !!updateAgeOnGet;
    this.updateAgeOnHas = !!updateAgeOnHas;
    this.ttlResolution = isPosInt(ttlResolution) || ttlResolution === 0 ? ttlResolution : 1;
    this.ttlAutopurge = !!ttlAutopurge;
    this.ttl = ttl || 0;
    if (this.ttl) {
      if (!isPosInt(this.ttl)) {
        throw new TypeError("ttl must be a positive integer if specified");
      }
      this.#initializeTTLTracking();
    }
    if (this.#max === 0 && this.ttl === 0 && this.#maxSize === 0) {
      throw new TypeError("At least one of max, maxSize, or ttl is required");
    }
    if (!this.ttlAutopurge && !this.#max && !this.#maxSize) {
      const code = "LRU_CACHE_UNBOUNDED";
      if (shouldWarn(code)) {
        warned.add(code);
        const msg = "TTL caching without ttlAutopurge, max, or maxSize can " + "result in unbounded memory consumption.";
        emitWarning(msg, "UnboundedCacheWarning", code, LRUCache);
      }
    }
  }
  getRemainingTTL(key) {
    return this.#keyMap.has(key) ? Infinity : 0;
  }
  #initializeTTLTracking() {
    const ttls = new ZeroArray(this.#max);
    const starts = new ZeroArray(this.#max);
    this.#ttls = ttls;
    this.#starts = starts;
    this.#setItemTTL = (index, ttl, start = perf.now()) => {
      starts[index] = ttl !== 0 ? start : 0;
      ttls[index] = ttl;
      if (ttl !== 0 && this.ttlAutopurge) {
        const t = setTimeout(() => {
          if (this.#isStale(index)) {
            this.#delete(this.#keyList[index], "expire");
          }
        }, ttl + 1);
        if (t.unref) {
          t.unref();
        }
      }
    };
    this.#updateItemAge = (index) => {
      starts[index] = ttls[index] !== 0 ? perf.now() : 0;
    };
    this.#statusTTL = (status, index) => {
      if (ttls[index]) {
        const ttl = ttls[index];
        const start = starts[index];
        if (!ttl || !start)
          return;
        status.ttl = ttl;
        status.start = start;
        status.now = cachedNow || getNow();
        const age = status.now - start;
        status.remainingTTL = ttl - age;
      }
    };
    let cachedNow = 0;
    const getNow = () => {
      const n2 = perf.now();
      if (this.ttlResolution > 0) {
        cachedNow = n2;
        const t = setTimeout(() => cachedNow = 0, this.ttlResolution);
        if (t.unref) {
          t.unref();
        }
      }
      return n2;
    };
    this.getRemainingTTL = (key) => {
      const index = this.#keyMap.get(key);
      if (index === undefined) {
        return 0;
      }
      const ttl = ttls[index];
      const start = starts[index];
      if (!ttl || !start) {
        return Infinity;
      }
      const age = (cachedNow || getNow()) - start;
      return ttl - age;
    };
    this.#isStale = (index) => {
      const s = starts[index];
      const t = ttls[index];
      return !!t && !!s && (cachedNow || getNow()) - s > t;
    };
  }
  #updateItemAge = () => {};
  #statusTTL = () => {};
  #setItemTTL = () => {};
  #isStale = () => false;
  #initializeSizeTracking() {
    const sizes = new ZeroArray(this.#max);
    this.#calculatedSize = 0;
    this.#sizes = sizes;
    this.#removeItemSize = (index) => {
      this.#calculatedSize -= sizes[index];
      sizes[index] = 0;
    };
    this.#requireSize = (k, v, size, sizeCalculation) => {
      if (this.#isBackgroundFetch(v)) {
        return 0;
      }
      if (!isPosInt(size)) {
        if (sizeCalculation) {
          if (typeof sizeCalculation !== "function") {
            throw new TypeError("sizeCalculation must be a function");
          }
          size = sizeCalculation(v, k);
          if (!isPosInt(size)) {
            throw new TypeError("sizeCalculation return invalid (expect positive integer)");
          }
        } else {
          throw new TypeError("invalid size value (must be positive integer). " + "When maxSize or maxEntrySize is used, sizeCalculation " + "or size must be set.");
        }
      }
      return size;
    };
    this.#addItemSize = (index, size, status) => {
      sizes[index] = size;
      if (this.#maxSize) {
        const maxSize = this.#maxSize - sizes[index];
        while (this.#calculatedSize > maxSize) {
          this.#evict(true);
        }
      }
      this.#calculatedSize += sizes[index];
      if (status) {
        status.entrySize = size;
        status.totalCalculatedSize = this.#calculatedSize;
      }
    };
  }
  #removeItemSize = (_i) => {};
  #addItemSize = (_i, _s, _st) => {};
  #requireSize = (_k, _v, size, sizeCalculation) => {
    if (size || sizeCalculation) {
      throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");
    }
    return 0;
  };
  *#indexes({ allowStale = this.allowStale } = {}) {
    if (this.#size) {
      for (let i = this.#tail;; ) {
        if (!this.#isValidIndex(i)) {
          break;
        }
        if (allowStale || !this.#isStale(i)) {
          yield i;
        }
        if (i === this.#head) {
          break;
        } else {
          i = this.#prev[i];
        }
      }
    }
  }
  *#rindexes({ allowStale = this.allowStale } = {}) {
    if (this.#size) {
      for (let i = this.#head;; ) {
        if (!this.#isValidIndex(i)) {
          break;
        }
        if (allowStale || !this.#isStale(i)) {
          yield i;
        }
        if (i === this.#tail) {
          break;
        } else {
          i = this.#next[i];
        }
      }
    }
  }
  #isValidIndex(index) {
    return index !== undefined && this.#keyMap.get(this.#keyList[index]) === index;
  }
  *entries() {
    for (const i of this.#indexes()) {
      if (this.#valList[i] !== undefined && this.#keyList[i] !== undefined && !this.#isBackgroundFetch(this.#valList[i])) {
        yield [this.#keyList[i], this.#valList[i]];
      }
    }
  }
  *rentries() {
    for (const i of this.#rindexes()) {
      if (this.#valList[i] !== undefined && this.#keyList[i] !== undefined && !this.#isBackgroundFetch(this.#valList[i])) {
        yield [this.#keyList[i], this.#valList[i]];
      }
    }
  }
  *keys() {
    for (const i of this.#indexes()) {
      const k = this.#keyList[i];
      if (k !== undefined && !this.#isBackgroundFetch(this.#valList[i])) {
        yield k;
      }
    }
  }
  *rkeys() {
    for (const i of this.#rindexes()) {
      const k = this.#keyList[i];
      if (k !== undefined && !this.#isBackgroundFetch(this.#valList[i])) {
        yield k;
      }
    }
  }
  *values() {
    for (const i of this.#indexes()) {
      const v = this.#valList[i];
      if (v !== undefined && !this.#isBackgroundFetch(this.#valList[i])) {
        yield this.#valList[i];
      }
    }
  }
  *rvalues() {
    for (const i of this.#rindexes()) {
      const v = this.#valList[i];
      if (v !== undefined && !this.#isBackgroundFetch(this.#valList[i])) {
        yield this.#valList[i];
      }
    }
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  [Symbol.toStringTag] = "LRUCache";
  find(fn, getOptions = {}) {
    for (const i of this.#indexes()) {
      const v = this.#valList[i];
      const value = this.#isBackgroundFetch(v) ? v.__staleWhileFetching : v;
      if (value === undefined)
        continue;
      if (fn(value, this.#keyList[i], this)) {
        return this.get(this.#keyList[i], getOptions);
      }
    }
  }
  forEach(fn, thisp = this) {
    for (const i of this.#indexes()) {
      const v = this.#valList[i];
      const value = this.#isBackgroundFetch(v) ? v.__staleWhileFetching : v;
      if (value === undefined)
        continue;
      fn.call(thisp, value, this.#keyList[i], this);
    }
  }
  rforEach(fn, thisp = this) {
    for (const i of this.#rindexes()) {
      const v = this.#valList[i];
      const value = this.#isBackgroundFetch(v) ? v.__staleWhileFetching : v;
      if (value === undefined)
        continue;
      fn.call(thisp, value, this.#keyList[i], this);
    }
  }
  purgeStale() {
    let deleted = false;
    for (const i of this.#rindexes({ allowStale: true })) {
      if (this.#isStale(i)) {
        this.#delete(this.#keyList[i], "expire");
        deleted = true;
      }
    }
    return deleted;
  }
  info(key) {
    const i = this.#keyMap.get(key);
    if (i === undefined)
      return;
    const v = this.#valList[i];
    const value = this.#isBackgroundFetch(v) ? v.__staleWhileFetching : v;
    if (value === undefined)
      return;
    const entry = { value };
    if (this.#ttls && this.#starts) {
      const ttl = this.#ttls[i];
      const start = this.#starts[i];
      if (ttl && start) {
        const remain = ttl - (perf.now() - start);
        entry.ttl = remain;
        entry.start = Date.now();
      }
    }
    if (this.#sizes) {
      entry.size = this.#sizes[i];
    }
    return entry;
  }
  dump() {
    const arr = [];
    for (const i of this.#indexes({ allowStale: true })) {
      const key = this.#keyList[i];
      const v = this.#valList[i];
      const value = this.#isBackgroundFetch(v) ? v.__staleWhileFetching : v;
      if (value === undefined || key === undefined)
        continue;
      const entry = { value };
      if (this.#ttls && this.#starts) {
        entry.ttl = this.#ttls[i];
        const age = perf.now() - this.#starts[i];
        entry.start = Math.floor(Date.now() - age);
      }
      if (this.#sizes) {
        entry.size = this.#sizes[i];
      }
      arr.unshift([key, entry]);
    }
    return arr;
  }
  load(arr) {
    this.clear();
    for (const [key, entry] of arr) {
      if (entry.start) {
        const age = Date.now() - entry.start;
        entry.start = perf.now() - age;
      }
      this.set(key, entry.value, entry);
    }
  }
  set(k, v, setOptions = {}) {
    if (v === undefined) {
      this.delete(k);
      return this;
    }
    const { ttl = this.ttl, start, noDisposeOnSet = this.noDisposeOnSet, sizeCalculation = this.sizeCalculation, status } = setOptions;
    let { noUpdateTTL = this.noUpdateTTL } = setOptions;
    const size = this.#requireSize(k, v, setOptions.size || 0, sizeCalculation);
    if (this.maxEntrySize && size > this.maxEntrySize) {
      if (status) {
        status.set = "miss";
        status.maxEntrySizeExceeded = true;
      }
      this.#delete(k, "set");
      return this;
    }
    let index = this.#size === 0 ? undefined : this.#keyMap.get(k);
    if (index === undefined) {
      index = this.#size === 0 ? this.#tail : this.#free.length !== 0 ? this.#free.pop() : this.#size === this.#max ? this.#evict(false) : this.#size;
      this.#keyList[index] = k;
      this.#valList[index] = v;
      this.#keyMap.set(k, index);
      this.#next[this.#tail] = index;
      this.#prev[index] = this.#tail;
      this.#tail = index;
      this.#size++;
      this.#addItemSize(index, size, status);
      if (status)
        status.set = "add";
      noUpdateTTL = false;
    } else {
      this.#moveToTail(index);
      const oldVal = this.#valList[index];
      if (v !== oldVal) {
        if (this.#hasFetchMethod && this.#isBackgroundFetch(oldVal)) {
          oldVal.__abortController.abort(new Error("replaced"));
          const { __staleWhileFetching: s } = oldVal;
          if (s !== undefined && !noDisposeOnSet) {
            if (this.#hasDispose) {
              this.#dispose?.(s, k, "set");
            }
            if (this.#hasDisposeAfter) {
              this.#disposed?.push([s, k, "set"]);
            }
          }
        } else if (!noDisposeOnSet) {
          if (this.#hasDispose) {
            this.#dispose?.(oldVal, k, "set");
          }
          if (this.#hasDisposeAfter) {
            this.#disposed?.push([oldVal, k, "set"]);
          }
        }
        this.#removeItemSize(index);
        this.#addItemSize(index, size, status);
        this.#valList[index] = v;
        if (status) {
          status.set = "replace";
          const oldValue = oldVal && this.#isBackgroundFetch(oldVal) ? oldVal.__staleWhileFetching : oldVal;
          if (oldValue !== undefined)
            status.oldValue = oldValue;
        }
      } else if (status) {
        status.set = "update";
      }
    }
    if (ttl !== 0 && !this.#ttls) {
      this.#initializeTTLTracking();
    }
    if (this.#ttls) {
      if (!noUpdateTTL) {
        this.#setItemTTL(index, ttl, start);
      }
      if (status)
        this.#statusTTL(status, index);
    }
    if (!noDisposeOnSet && this.#hasDisposeAfter && this.#disposed) {
      const dt = this.#disposed;
      let task;
      while (task = dt?.shift()) {
        this.#disposeAfter?.(...task);
      }
    }
    return this;
  }
  pop() {
    try {
      while (this.#size) {
        const val = this.#valList[this.#head];
        this.#evict(true);
        if (this.#isBackgroundFetch(val)) {
          if (val.__staleWhileFetching) {
            return val.__staleWhileFetching;
          }
        } else if (val !== undefined) {
          return val;
        }
      }
    } finally {
      if (this.#hasDisposeAfter && this.#disposed) {
        const dt = this.#disposed;
        let task;
        while (task = dt?.shift()) {
          this.#disposeAfter?.(...task);
        }
      }
    }
  }
  #evict(free) {
    const head = this.#head;
    const k = this.#keyList[head];
    const v = this.#valList[head];
    if (this.#hasFetchMethod && this.#isBackgroundFetch(v)) {
      v.__abortController.abort(new Error("evicted"));
    } else if (this.#hasDispose || this.#hasDisposeAfter) {
      if (this.#hasDispose) {
        this.#dispose?.(v, k, "evict");
      }
      if (this.#hasDisposeAfter) {
        this.#disposed?.push([v, k, "evict"]);
      }
    }
    this.#removeItemSize(head);
    if (free) {
      this.#keyList[head] = undefined;
      this.#valList[head] = undefined;
      this.#free.push(head);
    }
    if (this.#size === 1) {
      this.#head = this.#tail = 0;
      this.#free.length = 0;
    } else {
      this.#head = this.#next[head];
    }
    this.#keyMap.delete(k);
    this.#size--;
    return head;
  }
  has(k, hasOptions = {}) {
    const { updateAgeOnHas = this.updateAgeOnHas, status } = hasOptions;
    const index = this.#keyMap.get(k);
    if (index !== undefined) {
      const v = this.#valList[index];
      if (this.#isBackgroundFetch(v) && v.__staleWhileFetching === undefined) {
        return false;
      }
      if (!this.#isStale(index)) {
        if (updateAgeOnHas) {
          this.#updateItemAge(index);
        }
        if (status) {
          status.has = "hit";
          this.#statusTTL(status, index);
        }
        return true;
      } else if (status) {
        status.has = "stale";
        this.#statusTTL(status, index);
      }
    } else if (status) {
      status.has = "miss";
    }
    return false;
  }
  peek(k, peekOptions = {}) {
    const { allowStale = this.allowStale } = peekOptions;
    const index = this.#keyMap.get(k);
    if (index === undefined || !allowStale && this.#isStale(index)) {
      return;
    }
    const v = this.#valList[index];
    return this.#isBackgroundFetch(v) ? v.__staleWhileFetching : v;
  }
  #backgroundFetch(k, index, options, context) {
    const v = index === undefined ? undefined : this.#valList[index];
    if (this.#isBackgroundFetch(v)) {
      return v;
    }
    const ac = new AC;
    const { signal } = options;
    signal?.addEventListener("abort", () => ac.abort(signal.reason), {
      signal: ac.signal
    });
    const fetchOpts = {
      signal: ac.signal,
      options,
      context
    };
    const cb = (v2, updateCache = false) => {
      const { aborted } = ac.signal;
      const ignoreAbort = options.ignoreFetchAbort && v2 !== undefined;
      if (options.status) {
        if (aborted && !updateCache) {
          options.status.fetchAborted = true;
          options.status.fetchError = ac.signal.reason;
          if (ignoreAbort)
            options.status.fetchAbortIgnored = true;
        } else {
          options.status.fetchResolved = true;
        }
      }
      if (aborted && !ignoreAbort && !updateCache) {
        return fetchFail(ac.signal.reason);
      }
      const bf2 = p;
      if (this.#valList[index] === p) {
        if (v2 === undefined) {
          if (bf2.__staleWhileFetching) {
            this.#valList[index] = bf2.__staleWhileFetching;
          } else {
            this.#delete(k, "fetch");
          }
        } else {
          if (options.status)
            options.status.fetchUpdated = true;
          this.set(k, v2, fetchOpts.options);
        }
      }
      return v2;
    };
    const eb = (er) => {
      if (options.status) {
        options.status.fetchRejected = true;
        options.status.fetchError = er;
      }
      return fetchFail(er);
    };
    const fetchFail = (er) => {
      const { aborted } = ac.signal;
      const allowStaleAborted = aborted && options.allowStaleOnFetchAbort;
      const allowStale = allowStaleAborted || options.allowStaleOnFetchRejection;
      const noDelete = allowStale || options.noDeleteOnFetchRejection;
      const bf2 = p;
      if (this.#valList[index] === p) {
        const del = !noDelete || bf2.__staleWhileFetching === undefined;
        if (del) {
          this.#delete(k, "fetch");
        } else if (!allowStaleAborted) {
          this.#valList[index] = bf2.__staleWhileFetching;
        }
      }
      if (allowStale) {
        if (options.status && bf2.__staleWhileFetching !== undefined) {
          options.status.returnedStale = true;
        }
        return bf2.__staleWhileFetching;
      } else if (bf2.__returned === bf2) {
        throw er;
      }
    };
    const pcall = (res, rej) => {
      const fmp = this.#fetchMethod?.(k, v, fetchOpts);
      if (fmp && fmp instanceof Promise) {
        fmp.then((v2) => res(v2 === undefined ? undefined : v2), rej);
      }
      ac.signal.addEventListener("abort", () => {
        if (!options.ignoreFetchAbort || options.allowStaleOnFetchAbort) {
          res(undefined);
          if (options.allowStaleOnFetchAbort) {
            res = (v2) => cb(v2, true);
          }
        }
      });
    };
    if (options.status)
      options.status.fetchDispatched = true;
    const p = new Promise(pcall).then(cb, eb);
    const bf = Object.assign(p, {
      __abortController: ac,
      __staleWhileFetching: v,
      __returned: undefined
    });
    if (index === undefined) {
      this.set(k, bf, { ...fetchOpts.options, status: undefined });
      index = this.#keyMap.get(k);
    } else {
      this.#valList[index] = bf;
    }
    return bf;
  }
  #isBackgroundFetch(p) {
    if (!this.#hasFetchMethod)
      return false;
    const b = p;
    return !!b && b instanceof Promise && b.hasOwnProperty("__staleWhileFetching") && b.__abortController instanceof AC;
  }
  async fetch(k, fetchOptions = {}) {
    const {
      allowStale = this.allowStale,
      updateAgeOnGet = this.updateAgeOnGet,
      noDeleteOnStaleGet = this.noDeleteOnStaleGet,
      ttl = this.ttl,
      noDisposeOnSet = this.noDisposeOnSet,
      size = 0,
      sizeCalculation = this.sizeCalculation,
      noUpdateTTL = this.noUpdateTTL,
      noDeleteOnFetchRejection = this.noDeleteOnFetchRejection,
      allowStaleOnFetchRejection = this.allowStaleOnFetchRejection,
      ignoreFetchAbort = this.ignoreFetchAbort,
      allowStaleOnFetchAbort = this.allowStaleOnFetchAbort,
      context,
      forceRefresh = false,
      status,
      signal
    } = fetchOptions;
    if (!this.#hasFetchMethod) {
      if (status)
        status.fetch = "get";
      return this.get(k, {
        allowStale,
        updateAgeOnGet,
        noDeleteOnStaleGet,
        status
      });
    }
    const options = {
      allowStale,
      updateAgeOnGet,
      noDeleteOnStaleGet,
      ttl,
      noDisposeOnSet,
      size,
      sizeCalculation,
      noUpdateTTL,
      noDeleteOnFetchRejection,
      allowStaleOnFetchRejection,
      allowStaleOnFetchAbort,
      ignoreFetchAbort,
      status,
      signal
    };
    let index = this.#keyMap.get(k);
    if (index === undefined) {
      if (status)
        status.fetch = "miss";
      const p = this.#backgroundFetch(k, index, options, context);
      return p.__returned = p;
    } else {
      const v = this.#valList[index];
      if (this.#isBackgroundFetch(v)) {
        const stale = allowStale && v.__staleWhileFetching !== undefined;
        if (status) {
          status.fetch = "inflight";
          if (stale)
            status.returnedStale = true;
        }
        return stale ? v.__staleWhileFetching : v.__returned = v;
      }
      const isStale = this.#isStale(index);
      if (!forceRefresh && !isStale) {
        if (status)
          status.fetch = "hit";
        this.#moveToTail(index);
        if (updateAgeOnGet) {
          this.#updateItemAge(index);
        }
        if (status)
          this.#statusTTL(status, index);
        return v;
      }
      const p = this.#backgroundFetch(k, index, options, context);
      const hasStale = p.__staleWhileFetching !== undefined;
      const staleVal = hasStale && allowStale;
      if (status) {
        status.fetch = isStale ? "stale" : "refresh";
        if (staleVal && isStale)
          status.returnedStale = true;
      }
      return staleVal ? p.__staleWhileFetching : p.__returned = p;
    }
  }
  async forceFetch(k, fetchOptions = {}) {
    const v = await this.fetch(k, fetchOptions);
    if (v === undefined)
      throw new Error("fetch() returned undefined");
    return v;
  }
  memo(k, memoOptions = {}) {
    const memoMethod = this.#memoMethod;
    if (!memoMethod) {
      throw new Error("no memoMethod provided to constructor");
    }
    const { context, forceRefresh, ...options } = memoOptions;
    const v = this.get(k, options);
    if (!forceRefresh && v !== undefined)
      return v;
    const vv = memoMethod(k, v, {
      options,
      context
    });
    this.set(k, vv, options);
    return vv;
  }
  get(k, getOptions = {}) {
    const { allowStale = this.allowStale, updateAgeOnGet = this.updateAgeOnGet, noDeleteOnStaleGet = this.noDeleteOnStaleGet, status } = getOptions;
    const index = this.#keyMap.get(k);
    if (index !== undefined) {
      const value = this.#valList[index];
      const fetching = this.#isBackgroundFetch(value);
      if (status)
        this.#statusTTL(status, index);
      if (this.#isStale(index)) {
        if (status)
          status.get = "stale";
        if (!fetching) {
          if (!noDeleteOnStaleGet) {
            this.#delete(k, "expire");
          }
          if (status && allowStale)
            status.returnedStale = true;
          return allowStale ? value : undefined;
        } else {
          if (status && allowStale && value.__staleWhileFetching !== undefined) {
            status.returnedStale = true;
          }
          return allowStale ? value.__staleWhileFetching : undefined;
        }
      } else {
        if (status)
          status.get = "hit";
        if (fetching) {
          return value.__staleWhileFetching;
        }
        this.#moveToTail(index);
        if (updateAgeOnGet) {
          this.#updateItemAge(index);
        }
        return value;
      }
    } else if (status) {
      status.get = "miss";
    }
  }
  #connect(p, n2) {
    this.#prev[n2] = p;
    this.#next[p] = n2;
  }
  #moveToTail(index) {
    if (index !== this.#tail) {
      if (index === this.#head) {
        this.#head = this.#next[index];
      } else {
        this.#connect(this.#prev[index], this.#next[index]);
      }
      this.#connect(this.#tail, index);
      this.#tail = index;
    }
  }
  delete(k) {
    return this.#delete(k, "delete");
  }
  #delete(k, reason) {
    let deleted = false;
    if (this.#size !== 0) {
      const index = this.#keyMap.get(k);
      if (index !== undefined) {
        deleted = true;
        if (this.#size === 1) {
          this.#clear(reason);
        } else {
          this.#removeItemSize(index);
          const v = this.#valList[index];
          if (this.#isBackgroundFetch(v)) {
            v.__abortController.abort(new Error("deleted"));
          } else if (this.#hasDispose || this.#hasDisposeAfter) {
            if (this.#hasDispose) {
              this.#dispose?.(v, k, reason);
            }
            if (this.#hasDisposeAfter) {
              this.#disposed?.push([v, k, reason]);
            }
          }
          this.#keyMap.delete(k);
          this.#keyList[index] = undefined;
          this.#valList[index] = undefined;
          if (index === this.#tail) {
            this.#tail = this.#prev[index];
          } else if (index === this.#head) {
            this.#head = this.#next[index];
          } else {
            const pi = this.#prev[index];
            this.#next[pi] = this.#next[index];
            const ni = this.#next[index];
            this.#prev[ni] = this.#prev[index];
          }
          this.#size--;
          this.#free.push(index);
        }
      }
    }
    if (this.#hasDisposeAfter && this.#disposed?.length) {
      const dt = this.#disposed;
      let task;
      while (task = dt?.shift()) {
        this.#disposeAfter?.(...task);
      }
    }
    return deleted;
  }
  clear() {
    return this.#clear("delete");
  }
  #clear(reason) {
    for (const index of this.#rindexes({ allowStale: true })) {
      const v = this.#valList[index];
      if (this.#isBackgroundFetch(v)) {
        v.__abortController.abort(new Error("deleted"));
      } else {
        const k = this.#keyList[index];
        if (this.#hasDispose) {
          this.#dispose?.(v, k, reason);
        }
        if (this.#hasDisposeAfter) {
          this.#disposed?.push([v, k, reason]);
        }
      }
    }
    this.#keyMap.clear();
    this.#valList.fill(undefined);
    this.#keyList.fill(undefined);
    if (this.#ttls && this.#starts) {
      this.#ttls.fill(0);
      this.#starts.fill(0);
    }
    if (this.#sizes) {
      this.#sizes.fill(0);
    }
    this.#head = 0;
    this.#tail = 0;
    this.#free.length = 0;
    this.#calculatedSize = 0;
    this.#size = 0;
    if (this.#hasDisposeAfter && this.#disposed) {
      const dt = this.#disposed;
      let task;
      while (task = dt?.shift()) {
        this.#disposeAfter?.(...task);
      }
    }
  }
}

// node_modules/path-scurry/dist/esm/index.js
import { posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { lstatSync, readdir as readdirCB, readdirSync as readdirSync3, readlinkSync, realpathSync as rps } from "fs";
import * as actualFS from "node:fs";
import { lstat, readdir, readlink, realpath } from "node:fs/promises";

// node_modules/minipass/dist/esm/index.js
import { EventEmitter } from "node:events";
import Stream from "node:stream";
import { StringDecoder } from "node:string_decoder";
var proc = typeof process === "object" && process ? process : {
  stdout: null,
  stderr: null
};
var isStream = (s) => !!s && typeof s === "object" && (s instanceof Minipass || s instanceof Stream || isReadable(s) || isWritable(s));
var isReadable = (s) => !!s && typeof s === "object" && s instanceof EventEmitter && typeof s.pipe === "function" && s.pipe !== Stream.Writable.prototype.pipe;
var isWritable = (s) => !!s && typeof s === "object" && s instanceof EventEmitter && typeof s.write === "function" && typeof s.end === "function";
var EOF = Symbol("EOF");
var MAYBE_EMIT_END = Symbol("maybeEmitEnd");
var EMITTED_END = Symbol("emittedEnd");
var EMITTING_END = Symbol("emittingEnd");
var EMITTED_ERROR = Symbol("emittedError");
var CLOSED = Symbol("closed");
var READ = Symbol("read");
var FLUSH = Symbol("flush");
var FLUSHCHUNK = Symbol("flushChunk");
var ENCODING = Symbol("encoding");
var DECODER = Symbol("decoder");
var FLOWING = Symbol("flowing");
var PAUSED = Symbol("paused");
var RESUME = Symbol("resume");
var BUFFER = Symbol("buffer");
var PIPES = Symbol("pipes");
var BUFFERLENGTH = Symbol("bufferLength");
var BUFFERPUSH = Symbol("bufferPush");
var BUFFERSHIFT = Symbol("bufferShift");
var OBJECTMODE = Symbol("objectMode");
var DESTROYED = Symbol("destroyed");
var ERROR = Symbol("error");
var EMITDATA = Symbol("emitData");
var EMITEND = Symbol("emitEnd");
var EMITEND2 = Symbol("emitEnd2");
var ASYNC = Symbol("async");
var ABORT = Symbol("abort");
var ABORTED = Symbol("aborted");
var SIGNAL = Symbol("signal");
var DATALISTENERS = Symbol("dataListeners");
var DISCARDED = Symbol("discarded");
var defer = (fn) => Promise.resolve().then(fn);
var nodefer = (fn) => fn();
var isEndish = (ev) => ev === "end" || ev === "finish" || ev === "prefinish";
var isArrayBufferLike = (b) => b instanceof ArrayBuffer || !!b && typeof b === "object" && b.constructor && b.constructor.name === "ArrayBuffer" && b.byteLength >= 0;
var isArrayBufferView = (b) => !Buffer.isBuffer(b) && ArrayBuffer.isView(b);

class Pipe {
  src;
  dest;
  opts;
  ondrain;
  constructor(src, dest, opts) {
    this.src = src;
    this.dest = dest;
    this.opts = opts;
    this.ondrain = () => src[RESUME]();
    this.dest.on("drain", this.ondrain);
  }
  unpipe() {
    this.dest.removeListener("drain", this.ondrain);
  }
  proxyErrors(_er) {}
  end() {
    this.unpipe();
    if (this.opts.end)
      this.dest.end();
  }
}

class PipeProxyErrors extends Pipe {
  unpipe() {
    this.src.removeListener("error", this.proxyErrors);
    super.unpipe();
  }
  constructor(src, dest, opts) {
    super(src, dest, opts);
    this.proxyErrors = (er) => this.dest.emit("error", er);
    src.on("error", this.proxyErrors);
  }
}
var isObjectModeOptions = (o) => !!o.objectMode;
var isEncodingOptions = (o) => !o.objectMode && !!o.encoding && o.encoding !== "buffer";

class Minipass extends EventEmitter {
  [FLOWING] = false;
  [PAUSED] = false;
  [PIPES] = [];
  [BUFFER] = [];
  [OBJECTMODE];
  [ENCODING];
  [ASYNC];
  [DECODER];
  [EOF] = false;
  [EMITTED_END] = false;
  [EMITTING_END] = false;
  [CLOSED] = false;
  [EMITTED_ERROR] = null;
  [BUFFERLENGTH] = 0;
  [DESTROYED] = false;
  [SIGNAL];
  [ABORTED] = false;
  [DATALISTENERS] = 0;
  [DISCARDED] = false;
  writable = true;
  readable = true;
  constructor(...args) {
    const options = args[0] || {};
    super();
    if (options.objectMode && typeof options.encoding === "string") {
      throw new TypeError("Encoding and objectMode may not be used together");
    }
    if (isObjectModeOptions(options)) {
      this[OBJECTMODE] = true;
      this[ENCODING] = null;
    } else if (isEncodingOptions(options)) {
      this[ENCODING] = options.encoding;
      this[OBJECTMODE] = false;
    } else {
      this[OBJECTMODE] = false;
      this[ENCODING] = null;
    }
    this[ASYNC] = !!options.async;
    this[DECODER] = this[ENCODING] ? new StringDecoder(this[ENCODING]) : null;
    if (options && options.debugExposeBuffer === true) {
      Object.defineProperty(this, "buffer", { get: () => this[BUFFER] });
    }
    if (options && options.debugExposePipes === true) {
      Object.defineProperty(this, "pipes", { get: () => this[PIPES] });
    }
    const { signal } = options;
    if (signal) {
      this[SIGNAL] = signal;
      if (signal.aborted) {
        this[ABORT]();
      } else {
        signal.addEventListener("abort", () => this[ABORT]());
      }
    }
  }
  get bufferLength() {
    return this[BUFFERLENGTH];
  }
  get encoding() {
    return this[ENCODING];
  }
  set encoding(_enc) {
    throw new Error("Encoding must be set at instantiation time");
  }
  setEncoding(_enc) {
    throw new Error("Encoding must be set at instantiation time");
  }
  get objectMode() {
    return this[OBJECTMODE];
  }
  set objectMode(_om) {
    throw new Error("objectMode must be set at instantiation time");
  }
  get ["async"]() {
    return this[ASYNC];
  }
  set ["async"](a) {
    this[ASYNC] = this[ASYNC] || !!a;
  }
  [ABORT]() {
    this[ABORTED] = true;
    this.emit("abort", this[SIGNAL]?.reason);
    this.destroy(this[SIGNAL]?.reason);
  }
  get aborted() {
    return this[ABORTED];
  }
  set aborted(_) {}
  write(chunk, encoding, cb) {
    if (this[ABORTED])
      return false;
    if (this[EOF])
      throw new Error("write after end");
    if (this[DESTROYED]) {
      this.emit("error", Object.assign(new Error("Cannot call write after a stream was destroyed"), { code: "ERR_STREAM_DESTROYED" }));
      return true;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = "utf8";
    }
    if (!encoding)
      encoding = "utf8";
    const fn = this[ASYNC] ? defer : nodefer;
    if (!this[OBJECTMODE] && !Buffer.isBuffer(chunk)) {
      if (isArrayBufferView(chunk)) {
        chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      } else if (isArrayBufferLike(chunk)) {
        chunk = Buffer.from(chunk);
      } else if (typeof chunk !== "string") {
        throw new Error("Non-contiguous data written to non-objectMode stream");
      }
    }
    if (this[OBJECTMODE]) {
      if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
        this[FLUSH](true);
      if (this[FLOWING])
        this.emit("data", chunk);
      else
        this[BUFFERPUSH](chunk);
      if (this[BUFFERLENGTH] !== 0)
        this.emit("readable");
      if (cb)
        fn(cb);
      return this[FLOWING];
    }
    if (!chunk.length) {
      if (this[BUFFERLENGTH] !== 0)
        this.emit("readable");
      if (cb)
        fn(cb);
      return this[FLOWING];
    }
    if (typeof chunk === "string" && !(encoding === this[ENCODING] && !this[DECODER]?.lastNeed)) {
      chunk = Buffer.from(chunk, encoding);
    }
    if (Buffer.isBuffer(chunk) && this[ENCODING]) {
      chunk = this[DECODER].write(chunk);
    }
    if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
      this[FLUSH](true);
    if (this[FLOWING])
      this.emit("data", chunk);
    else
      this[BUFFERPUSH](chunk);
    if (this[BUFFERLENGTH] !== 0)
      this.emit("readable");
    if (cb)
      fn(cb);
    return this[FLOWING];
  }
  read(n2) {
    if (this[DESTROYED])
      return null;
    this[DISCARDED] = false;
    if (this[BUFFERLENGTH] === 0 || n2 === 0 || n2 && n2 > this[BUFFERLENGTH]) {
      this[MAYBE_EMIT_END]();
      return null;
    }
    if (this[OBJECTMODE])
      n2 = null;
    if (this[BUFFER].length > 1 && !this[OBJECTMODE]) {
      this[BUFFER] = [
        this[ENCODING] ? this[BUFFER].join("") : Buffer.concat(this[BUFFER], this[BUFFERLENGTH])
      ];
    }
    const ret = this[READ](n2 || null, this[BUFFER][0]);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [READ](n2, chunk) {
    if (this[OBJECTMODE])
      this[BUFFERSHIFT]();
    else {
      const c = chunk;
      if (n2 === c.length || n2 === null)
        this[BUFFERSHIFT]();
      else if (typeof c === "string") {
        this[BUFFER][0] = c.slice(n2);
        chunk = c.slice(0, n2);
        this[BUFFERLENGTH] -= n2;
      } else {
        this[BUFFER][0] = c.subarray(n2);
        chunk = c.subarray(0, n2);
        this[BUFFERLENGTH] -= n2;
      }
    }
    this.emit("data", chunk);
    if (!this[BUFFER].length && !this[EOF])
      this.emit("drain");
    return chunk;
  }
  end(chunk, encoding, cb) {
    if (typeof chunk === "function") {
      cb = chunk;
      chunk = undefined;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = "utf8";
    }
    if (chunk !== undefined)
      this.write(chunk, encoding);
    if (cb)
      this.once("end", cb);
    this[EOF] = true;
    this.writable = false;
    if (this[FLOWING] || !this[PAUSED])
      this[MAYBE_EMIT_END]();
    return this;
  }
  [RESUME]() {
    if (this[DESTROYED])
      return;
    if (!this[DATALISTENERS] && !this[PIPES].length) {
      this[DISCARDED] = true;
    }
    this[PAUSED] = false;
    this[FLOWING] = true;
    this.emit("resume");
    if (this[BUFFER].length)
      this[FLUSH]();
    else if (this[EOF])
      this[MAYBE_EMIT_END]();
    else
      this.emit("drain");
  }
  resume() {
    return this[RESUME]();
  }
  pause() {
    this[FLOWING] = false;
    this[PAUSED] = true;
    this[DISCARDED] = false;
  }
  get destroyed() {
    return this[DESTROYED];
  }
  get flowing() {
    return this[FLOWING];
  }
  get paused() {
    return this[PAUSED];
  }
  [BUFFERPUSH](chunk) {
    if (this[OBJECTMODE])
      this[BUFFERLENGTH] += 1;
    else
      this[BUFFERLENGTH] += chunk.length;
    this[BUFFER].push(chunk);
  }
  [BUFFERSHIFT]() {
    if (this[OBJECTMODE])
      this[BUFFERLENGTH] -= 1;
    else
      this[BUFFERLENGTH] -= this[BUFFER][0].length;
    return this[BUFFER].shift();
  }
  [FLUSH](noDrain = false) {
    do {} while (this[FLUSHCHUNK](this[BUFFERSHIFT]()) && this[BUFFER].length);
    if (!noDrain && !this[BUFFER].length && !this[EOF])
      this.emit("drain");
  }
  [FLUSHCHUNK](chunk) {
    this.emit("data", chunk);
    return this[FLOWING];
  }
  pipe(dest, opts) {
    if (this[DESTROYED])
      return dest;
    this[DISCARDED] = false;
    const ended = this[EMITTED_END];
    opts = opts || {};
    if (dest === proc.stdout || dest === proc.stderr)
      opts.end = false;
    else
      opts.end = opts.end !== false;
    opts.proxyErrors = !!opts.proxyErrors;
    if (ended) {
      if (opts.end)
        dest.end();
    } else {
      this[PIPES].push(!opts.proxyErrors ? new Pipe(this, dest, opts) : new PipeProxyErrors(this, dest, opts));
      if (this[ASYNC])
        defer(() => this[RESUME]());
      else
        this[RESUME]();
    }
    return dest;
  }
  unpipe(dest) {
    const p = this[PIPES].find((p2) => p2.dest === dest);
    if (p) {
      if (this[PIPES].length === 1) {
        if (this[FLOWING] && this[DATALISTENERS] === 0) {
          this[FLOWING] = false;
        }
        this[PIPES] = [];
      } else
        this[PIPES].splice(this[PIPES].indexOf(p), 1);
      p.unpipe();
    }
  }
  addListener(ev, handler) {
    return this.on(ev, handler);
  }
  on(ev, handler) {
    const ret = super.on(ev, handler);
    if (ev === "data") {
      this[DISCARDED] = false;
      this[DATALISTENERS]++;
      if (!this[PIPES].length && !this[FLOWING]) {
        this[RESUME]();
      }
    } else if (ev === "readable" && this[BUFFERLENGTH] !== 0) {
      super.emit("readable");
    } else if (isEndish(ev) && this[EMITTED_END]) {
      super.emit(ev);
      this.removeAllListeners(ev);
    } else if (ev === "error" && this[EMITTED_ERROR]) {
      const h = handler;
      if (this[ASYNC])
        defer(() => h.call(this, this[EMITTED_ERROR]));
      else
        h.call(this, this[EMITTED_ERROR]);
    }
    return ret;
  }
  removeListener(ev, handler) {
    return this.off(ev, handler);
  }
  off(ev, handler) {
    const ret = super.off(ev, handler);
    if (ev === "data") {
      this[DATALISTENERS] = this.listeners("data").length;
      if (this[DATALISTENERS] === 0 && !this[DISCARDED] && !this[PIPES].length) {
        this[FLOWING] = false;
      }
    }
    return ret;
  }
  removeAllListeners(ev) {
    const ret = super.removeAllListeners(ev);
    if (ev === "data" || ev === undefined) {
      this[DATALISTENERS] = 0;
      if (!this[DISCARDED] && !this[PIPES].length) {
        this[FLOWING] = false;
      }
    }
    return ret;
  }
  get emittedEnd() {
    return this[EMITTED_END];
  }
  [MAYBE_EMIT_END]() {
    if (!this[EMITTING_END] && !this[EMITTED_END] && !this[DESTROYED] && this[BUFFER].length === 0 && this[EOF]) {
      this[EMITTING_END] = true;
      this.emit("end");
      this.emit("prefinish");
      this.emit("finish");
      if (this[CLOSED])
        this.emit("close");
      this[EMITTING_END] = false;
    }
  }
  emit(ev, ...args) {
    const data = args[0];
    if (ev !== "error" && ev !== "close" && ev !== DESTROYED && this[DESTROYED]) {
      return false;
    } else if (ev === "data") {
      return !this[OBJECTMODE] && !data ? false : this[ASYNC] ? (defer(() => this[EMITDATA](data)), true) : this[EMITDATA](data);
    } else if (ev === "end") {
      return this[EMITEND]();
    } else if (ev === "close") {
      this[CLOSED] = true;
      if (!this[EMITTED_END] && !this[DESTROYED])
        return false;
      const ret2 = super.emit("close");
      this.removeAllListeners("close");
      return ret2;
    } else if (ev === "error") {
      this[EMITTED_ERROR] = data;
      super.emit(ERROR, data);
      const ret2 = !this[SIGNAL] || this.listeners("error").length ? super.emit("error", data) : false;
      this[MAYBE_EMIT_END]();
      return ret2;
    } else if (ev === "resume") {
      const ret2 = super.emit("resume");
      this[MAYBE_EMIT_END]();
      return ret2;
    } else if (ev === "finish" || ev === "prefinish") {
      const ret2 = super.emit(ev);
      this.removeAllListeners(ev);
      return ret2;
    }
    const ret = super.emit(ev, ...args);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [EMITDATA](data) {
    for (const p of this[PIPES]) {
      if (p.dest.write(data) === false)
        this.pause();
    }
    const ret = this[DISCARDED] ? false : super.emit("data", data);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [EMITEND]() {
    if (this[EMITTED_END])
      return false;
    this[EMITTED_END] = true;
    this.readable = false;
    return this[ASYNC] ? (defer(() => this[EMITEND2]()), true) : this[EMITEND2]();
  }
  [EMITEND2]() {
    if (this[DECODER]) {
      const data = this[DECODER].end();
      if (data) {
        for (const p of this[PIPES]) {
          p.dest.write(data);
        }
        if (!this[DISCARDED])
          super.emit("data", data);
      }
    }
    for (const p of this[PIPES]) {
      p.end();
    }
    const ret = super.emit("end");
    this.removeAllListeners("end");
    return ret;
  }
  async collect() {
    const buf = Object.assign([], {
      dataLength: 0
    });
    if (!this[OBJECTMODE])
      buf.dataLength = 0;
    const p = this.promise();
    this.on("data", (c) => {
      buf.push(c);
      if (!this[OBJECTMODE])
        buf.dataLength += c.length;
    });
    await p;
    return buf;
  }
  async concat() {
    if (this[OBJECTMODE]) {
      throw new Error("cannot concat in objectMode");
    }
    const buf = await this.collect();
    return this[ENCODING] ? buf.join("") : Buffer.concat(buf, buf.dataLength);
  }
  async promise() {
    return new Promise((resolve2, reject) => {
      this.on(DESTROYED, () => reject(new Error("stream destroyed")));
      this.on("error", (er) => reject(er));
      this.on("end", () => resolve2());
    });
  }
  [Symbol.asyncIterator]() {
    this[DISCARDED] = false;
    let stopped = false;
    const stop = async () => {
      this.pause();
      stopped = true;
      return { value: undefined, done: true };
    };
    const next = () => {
      if (stopped)
        return stop();
      const res = this.read();
      if (res !== null)
        return Promise.resolve({ done: false, value: res });
      if (this[EOF])
        return stop();
      let resolve2;
      let reject;
      const onerr = (er) => {
        this.off("data", ondata);
        this.off("end", onend);
        this.off(DESTROYED, ondestroy);
        stop();
        reject(er);
      };
      const ondata = (value) => {
        this.off("error", onerr);
        this.off("end", onend);
        this.off(DESTROYED, ondestroy);
        this.pause();
        resolve2({ value, done: !!this[EOF] });
      };
      const onend = () => {
        this.off("error", onerr);
        this.off("data", ondata);
        this.off(DESTROYED, ondestroy);
        stop();
        resolve2({ done: true, value: undefined });
      };
      const ondestroy = () => onerr(new Error("stream destroyed"));
      return new Promise((res2, rej) => {
        reject = rej;
        resolve2 = res2;
        this.once(DESTROYED, ondestroy);
        this.once("error", onerr);
        this.once("end", onend);
        this.once("data", ondata);
      });
    };
    return {
      next,
      throw: stop,
      return: stop,
      [Symbol.asyncIterator]() {
        return this;
      },
      [Symbol.asyncDispose]: async () => {}
    };
  }
  [Symbol.iterator]() {
    this[DISCARDED] = false;
    let stopped = false;
    const stop = () => {
      this.pause();
      this.off(ERROR, stop);
      this.off(DESTROYED, stop);
      this.off("end", stop);
      stopped = true;
      return { done: true, value: undefined };
    };
    const next = () => {
      if (stopped)
        return stop();
      const value = this.read();
      return value === null ? stop() : { done: false, value };
    };
    this.once("end", stop);
    this.once(ERROR, stop);
    this.once(DESTROYED, stop);
    return {
      next,
      throw: stop,
      return: stop,
      [Symbol.iterator]() {
        return this;
      },
      [Symbol.dispose]: () => {}
    };
  }
  destroy(er) {
    if (this[DESTROYED]) {
      if (er)
        this.emit("error", er);
      else
        this.emit(DESTROYED);
      return this;
    }
    this[DESTROYED] = true;
    this[DISCARDED] = true;
    this[BUFFER].length = 0;
    this[BUFFERLENGTH] = 0;
    const wc = this;
    if (typeof wc.close === "function" && !this[CLOSED])
      wc.close();
    if (er)
      this.emit("error", er);
    else
      this.emit(DESTROYED);
    return this;
  }
  static get isStream() {
    return isStream;
  }
}

// node_modules/path-scurry/dist/esm/index.js
var realpathSync2 = rps.native;
var defaultFS = {
  lstatSync,
  readdir: readdirCB,
  readdirSync: readdirSync3,
  readlinkSync,
  realpathSync: realpathSync2,
  promises: {
    lstat,
    readdir,
    readlink,
    realpath
  }
};
var fsFromOption = (fsOption) => !fsOption || fsOption === defaultFS || fsOption === actualFS ? defaultFS : {
  ...defaultFS,
  ...fsOption,
  promises: {
    ...defaultFS.promises,
    ...fsOption.promises || {}
  }
};
var uncDriveRegexp = /^\\\\\?\\([a-z]:)\\?$/i;
var uncToDrive = (rootPath) => rootPath.replace(/\//g, "\\").replace(uncDriveRegexp, "$1\\");
var eitherSep = /[\\\/]/;
var UNKNOWN = 0;
var IFIFO = 1;
var IFCHR = 2;
var IFDIR = 4;
var IFBLK = 6;
var IFREG = 8;
var IFLNK = 10;
var IFSOCK = 12;
var IFMT = 15;
var IFMT_UNKNOWN = ~IFMT;
var READDIR_CALLED = 16;
var LSTAT_CALLED = 32;
var ENOTDIR = 64;
var ENOENT = 128;
var ENOREADLINK = 256;
var ENOREALPATH = 512;
var ENOCHILD = ENOTDIR | ENOENT | ENOREALPATH;
var TYPEMASK = 1023;
var entToType = (s) => s.isFile() ? IFREG : s.isDirectory() ? IFDIR : s.isSymbolicLink() ? IFLNK : s.isCharacterDevice() ? IFCHR : s.isBlockDevice() ? IFBLK : s.isSocket() ? IFSOCK : s.isFIFO() ? IFIFO : UNKNOWN;
var normalizeCache = new Map;
var normalize = (s) => {
  const c = normalizeCache.get(s);
  if (c)
    return c;
  const n2 = s.normalize("NFKD");
  normalizeCache.set(s, n2);
  return n2;
};
var normalizeNocaseCache = new Map;
var normalizeNocase = (s) => {
  const c = normalizeNocaseCache.get(s);
  if (c)
    return c;
  const n2 = normalize(s.toLowerCase());
  normalizeNocaseCache.set(s, n2);
  return n2;
};

class ResolveCache extends LRUCache {
  constructor() {
    super({ max: 256 });
  }
}

class ChildrenCache extends LRUCache {
  constructor(maxSize = 16 * 1024) {
    super({
      maxSize,
      sizeCalculation: (a) => a.length + 1
    });
  }
}
var setAsCwd = Symbol("PathScurry setAsCwd");

class PathBase {
  name;
  root;
  roots;
  parent;
  nocase;
  isCWD = false;
  #fs;
  #dev;
  get dev() {
    return this.#dev;
  }
  #mode;
  get mode() {
    return this.#mode;
  }
  #nlink;
  get nlink() {
    return this.#nlink;
  }
  #uid;
  get uid() {
    return this.#uid;
  }
  #gid;
  get gid() {
    return this.#gid;
  }
  #rdev;
  get rdev() {
    return this.#rdev;
  }
  #blksize;
  get blksize() {
    return this.#blksize;
  }
  #ino;
  get ino() {
    return this.#ino;
  }
  #size;
  get size() {
    return this.#size;
  }
  #blocks;
  get blocks() {
    return this.#blocks;
  }
  #atimeMs;
  get atimeMs() {
    return this.#atimeMs;
  }
  #mtimeMs;
  get mtimeMs() {
    return this.#mtimeMs;
  }
  #ctimeMs;
  get ctimeMs() {
    return this.#ctimeMs;
  }
  #birthtimeMs;
  get birthtimeMs() {
    return this.#birthtimeMs;
  }
  #atime;
  get atime() {
    return this.#atime;
  }
  #mtime;
  get mtime() {
    return this.#mtime;
  }
  #ctime;
  get ctime() {
    return this.#ctime;
  }
  #birthtime;
  get birthtime() {
    return this.#birthtime;
  }
  #matchName;
  #depth;
  #fullpath;
  #fullpathPosix;
  #relative;
  #relativePosix;
  #type;
  #children;
  #linkTarget;
  #realpath;
  get parentPath() {
    return (this.parent || this).fullpath();
  }
  get path() {
    return this.parentPath;
  }
  constructor(name, type = UNKNOWN, root2, roots, nocase, children, opts) {
    this.name = name;
    this.#matchName = nocase ? normalizeNocase(name) : normalize(name);
    this.#type = type & TYPEMASK;
    this.nocase = nocase;
    this.roots = roots;
    this.root = root2 || this;
    this.#children = children;
    this.#fullpath = opts.fullpath;
    this.#relative = opts.relative;
    this.#relativePosix = opts.relativePosix;
    this.parent = opts.parent;
    if (this.parent) {
      this.#fs = this.parent.#fs;
    } else {
      this.#fs = fsFromOption(opts.fs);
    }
  }
  depth() {
    if (this.#depth !== undefined)
      return this.#depth;
    if (!this.parent)
      return this.#depth = 0;
    return this.#depth = this.parent.depth() + 1;
  }
  childrenCache() {
    return this.#children;
  }
  resolve(path2) {
    if (!path2) {
      return this;
    }
    const rootPath = this.getRootString(path2);
    const dir = path2.substring(rootPath.length);
    const dirParts = dir.split(this.splitSep);
    const result = rootPath ? this.getRoot(rootPath).#resolveParts(dirParts) : this.#resolveParts(dirParts);
    return result;
  }
  #resolveParts(dirParts) {
    let p = this;
    for (const part of dirParts) {
      p = p.child(part);
    }
    return p;
  }
  children() {
    const cached = this.#children.get(this);
    if (cached) {
      return cached;
    }
    const children = Object.assign([], { provisional: 0 });
    this.#children.set(this, children);
    this.#type &= ~READDIR_CALLED;
    return children;
  }
  child(pathPart, opts) {
    if (pathPart === "" || pathPart === ".") {
      return this;
    }
    if (pathPart === "..") {
      return this.parent || this;
    }
    const children = this.children();
    const name = this.nocase ? normalizeNocase(pathPart) : normalize(pathPart);
    for (const p of children) {
      if (p.#matchName === name) {
        return p;
      }
    }
    const s = this.parent ? this.sep : "";
    const fullpath = this.#fullpath ? this.#fullpath + s + pathPart : undefined;
    const pchild = this.newChild(pathPart, UNKNOWN, {
      ...opts,
      parent: this,
      fullpath
    });
    if (!this.canReaddir()) {
      pchild.#type |= ENOENT;
    }
    children.push(pchild);
    return pchild;
  }
  relative() {
    if (this.isCWD)
      return "";
    if (this.#relative !== undefined) {
      return this.#relative;
    }
    const name = this.name;
    const p = this.parent;
    if (!p) {
      return this.#relative = this.name;
    }
    const pv = p.relative();
    return pv + (!pv || !p.parent ? "" : this.sep) + name;
  }
  relativePosix() {
    if (this.sep === "/")
      return this.relative();
    if (this.isCWD)
      return "";
    if (this.#relativePosix !== undefined)
      return this.#relativePosix;
    const name = this.name;
    const p = this.parent;
    if (!p) {
      return this.#relativePosix = this.fullpathPosix();
    }
    const pv = p.relativePosix();
    return pv + (!pv || !p.parent ? "" : "/") + name;
  }
  fullpath() {
    if (this.#fullpath !== undefined) {
      return this.#fullpath;
    }
    const name = this.name;
    const p = this.parent;
    if (!p) {
      return this.#fullpath = this.name;
    }
    const pv = p.fullpath();
    const fp = pv + (!p.parent ? "" : this.sep) + name;
    return this.#fullpath = fp;
  }
  fullpathPosix() {
    if (this.#fullpathPosix !== undefined)
      return this.#fullpathPosix;
    if (this.sep === "/")
      return this.#fullpathPosix = this.fullpath();
    if (!this.parent) {
      const p2 = this.fullpath().replace(/\\/g, "/");
      if (/^[a-z]:\//i.test(p2)) {
        return this.#fullpathPosix = `//?/${p2}`;
      } else {
        return this.#fullpathPosix = p2;
      }
    }
    const p = this.parent;
    const pfpp = p.fullpathPosix();
    const fpp = pfpp + (!pfpp || !p.parent ? "" : "/") + this.name;
    return this.#fullpathPosix = fpp;
  }
  isUnknown() {
    return (this.#type & IFMT) === UNKNOWN;
  }
  isType(type) {
    return this[`is${type}`]();
  }
  getType() {
    return this.isUnknown() ? "Unknown" : this.isDirectory() ? "Directory" : this.isFile() ? "File" : this.isSymbolicLink() ? "SymbolicLink" : this.isFIFO() ? "FIFO" : this.isCharacterDevice() ? "CharacterDevice" : this.isBlockDevice() ? "BlockDevice" : this.isSocket() ? "Socket" : "Unknown";
  }
  isFile() {
    return (this.#type & IFMT) === IFREG;
  }
  isDirectory() {
    return (this.#type & IFMT) === IFDIR;
  }
  isCharacterDevice() {
    return (this.#type & IFMT) === IFCHR;
  }
  isBlockDevice() {
    return (this.#type & IFMT) === IFBLK;
  }
  isFIFO() {
    return (this.#type & IFMT) === IFIFO;
  }
  isSocket() {
    return (this.#type & IFMT) === IFSOCK;
  }
  isSymbolicLink() {
    return (this.#type & IFLNK) === IFLNK;
  }
  lstatCached() {
    return this.#type & LSTAT_CALLED ? this : undefined;
  }
  readlinkCached() {
    return this.#linkTarget;
  }
  realpathCached() {
    return this.#realpath;
  }
  readdirCached() {
    const children = this.children();
    return children.slice(0, children.provisional);
  }
  canReadlink() {
    if (this.#linkTarget)
      return true;
    if (!this.parent)
      return false;
    const ifmt = this.#type & IFMT;
    return !(ifmt !== UNKNOWN && ifmt !== IFLNK || this.#type & ENOREADLINK || this.#type & ENOENT);
  }
  calledReaddir() {
    return !!(this.#type & READDIR_CALLED);
  }
  isENOENT() {
    return !!(this.#type & ENOENT);
  }
  isNamed(n2) {
    return !this.nocase ? this.#matchName === normalize(n2) : this.#matchName === normalizeNocase(n2);
  }
  async readlink() {
    const target = this.#linkTarget;
    if (target) {
      return target;
    }
    if (!this.canReadlink()) {
      return;
    }
    if (!this.parent) {
      return;
    }
    try {
      const read = await this.#fs.promises.readlink(this.fullpath());
      const linkTarget = (await this.parent.realpath())?.resolve(read);
      if (linkTarget) {
        return this.#linkTarget = linkTarget;
      }
    } catch (er) {
      this.#readlinkFail(er.code);
      return;
    }
  }
  readlinkSync() {
    const target = this.#linkTarget;
    if (target) {
      return target;
    }
    if (!this.canReadlink()) {
      return;
    }
    if (!this.parent) {
      return;
    }
    try {
      const read = this.#fs.readlinkSync(this.fullpath());
      const linkTarget = this.parent.realpathSync()?.resolve(read);
      if (linkTarget) {
        return this.#linkTarget = linkTarget;
      }
    } catch (er) {
      this.#readlinkFail(er.code);
      return;
    }
  }
  #readdirSuccess(children) {
    this.#type |= READDIR_CALLED;
    for (let p = children.provisional;p < children.length; p++) {
      const c = children[p];
      if (c)
        c.#markENOENT();
    }
  }
  #markENOENT() {
    if (this.#type & ENOENT)
      return;
    this.#type = (this.#type | ENOENT) & IFMT_UNKNOWN;
    this.#markChildrenENOENT();
  }
  #markChildrenENOENT() {
    const children = this.children();
    children.provisional = 0;
    for (const p of children) {
      p.#markENOENT();
    }
  }
  #markENOREALPATH() {
    this.#type |= ENOREALPATH;
    this.#markENOTDIR();
  }
  #markENOTDIR() {
    if (this.#type & ENOTDIR)
      return;
    let t = this.#type;
    if ((t & IFMT) === IFDIR)
      t &= IFMT_UNKNOWN;
    this.#type = t | ENOTDIR;
    this.#markChildrenENOENT();
  }
  #readdirFail(code = "") {
    if (code === "ENOTDIR" || code === "EPERM") {
      this.#markENOTDIR();
    } else if (code === "ENOENT") {
      this.#markENOENT();
    } else {
      this.children().provisional = 0;
    }
  }
  #lstatFail(code = "") {
    if (code === "ENOTDIR") {
      const p = this.parent;
      p.#markENOTDIR();
    } else if (code === "ENOENT") {
      this.#markENOENT();
    }
  }
  #readlinkFail(code = "") {
    let ter = this.#type;
    ter |= ENOREADLINK;
    if (code === "ENOENT")
      ter |= ENOENT;
    if (code === "EINVAL" || code === "UNKNOWN") {
      ter &= IFMT_UNKNOWN;
    }
    this.#type = ter;
    if (code === "ENOTDIR" && this.parent) {
      this.parent.#markENOTDIR();
    }
  }
  #readdirAddChild(e, c) {
    return this.#readdirMaybePromoteChild(e, c) || this.#readdirAddNewChild(e, c);
  }
  #readdirAddNewChild(e, c) {
    const type = entToType(e);
    const child = this.newChild(e.name, type, { parent: this });
    const ifmt = child.#type & IFMT;
    if (ifmt !== IFDIR && ifmt !== IFLNK && ifmt !== UNKNOWN) {
      child.#type |= ENOTDIR;
    }
    c.unshift(child);
    c.provisional++;
    return child;
  }
  #readdirMaybePromoteChild(e, c) {
    for (let p = c.provisional;p < c.length; p++) {
      const pchild = c[p];
      const name = this.nocase ? normalizeNocase(e.name) : normalize(e.name);
      if (name !== pchild.#matchName) {
        continue;
      }
      return this.#readdirPromoteChild(e, pchild, p, c);
    }
  }
  #readdirPromoteChild(e, p, index, c) {
    const v = p.name;
    p.#type = p.#type & IFMT_UNKNOWN | entToType(e);
    if (v !== e.name)
      p.name = e.name;
    if (index !== c.provisional) {
      if (index === c.length - 1)
        c.pop();
      else
        c.splice(index, 1);
      c.unshift(p);
    }
    c.provisional++;
    return p;
  }
  async lstat() {
    if ((this.#type & ENOENT) === 0) {
      try {
        this.#applyStat(await this.#fs.promises.lstat(this.fullpath()));
        return this;
      } catch (er) {
        this.#lstatFail(er.code);
      }
    }
  }
  lstatSync() {
    if ((this.#type & ENOENT) === 0) {
      try {
        this.#applyStat(this.#fs.lstatSync(this.fullpath()));
        return this;
      } catch (er) {
        this.#lstatFail(er.code);
      }
    }
  }
  #applyStat(st) {
    const { atime, atimeMs, birthtime, birthtimeMs, blksize, blocks, ctime, ctimeMs, dev, gid, ino, mode, mtime, mtimeMs, nlink, rdev, size, uid } = st;
    this.#atime = atime;
    this.#atimeMs = atimeMs;
    this.#birthtime = birthtime;
    this.#birthtimeMs = birthtimeMs;
    this.#blksize = blksize;
    this.#blocks = blocks;
    this.#ctime = ctime;
    this.#ctimeMs = ctimeMs;
    this.#dev = dev;
    this.#gid = gid;
    this.#ino = ino;
    this.#mode = mode;
    this.#mtime = mtime;
    this.#mtimeMs = mtimeMs;
    this.#nlink = nlink;
    this.#rdev = rdev;
    this.#size = size;
    this.#uid = uid;
    const ifmt = entToType(st);
    this.#type = this.#type & IFMT_UNKNOWN | ifmt | LSTAT_CALLED;
    if (ifmt !== UNKNOWN && ifmt !== IFDIR && ifmt !== IFLNK) {
      this.#type |= ENOTDIR;
    }
  }
  #onReaddirCB = [];
  #readdirCBInFlight = false;
  #callOnReaddirCB(children) {
    this.#readdirCBInFlight = false;
    const cbs = this.#onReaddirCB.slice();
    this.#onReaddirCB.length = 0;
    cbs.forEach((cb) => cb(null, children));
  }
  readdirCB(cb, allowZalgo = false) {
    if (!this.canReaddir()) {
      if (allowZalgo)
        cb(null, []);
      else
        queueMicrotask(() => cb(null, []));
      return;
    }
    const children = this.children();
    if (this.calledReaddir()) {
      const c = children.slice(0, children.provisional);
      if (allowZalgo)
        cb(null, c);
      else
        queueMicrotask(() => cb(null, c));
      return;
    }
    this.#onReaddirCB.push(cb);
    if (this.#readdirCBInFlight) {
      return;
    }
    this.#readdirCBInFlight = true;
    const fullpath = this.fullpath();
    this.#fs.readdir(fullpath, { withFileTypes: true }, (er, entries) => {
      if (er) {
        this.#readdirFail(er.code);
        children.provisional = 0;
      } else {
        for (const e of entries) {
          this.#readdirAddChild(e, children);
        }
        this.#readdirSuccess(children);
      }
      this.#callOnReaddirCB(children.slice(0, children.provisional));
      return;
    });
  }
  #asyncReaddirInFlight;
  async readdir() {
    if (!this.canReaddir()) {
      return [];
    }
    const children = this.children();
    if (this.calledReaddir()) {
      return children.slice(0, children.provisional);
    }
    const fullpath = this.fullpath();
    if (this.#asyncReaddirInFlight) {
      await this.#asyncReaddirInFlight;
    } else {
      let resolve2 = () => {};
      this.#asyncReaddirInFlight = new Promise((res) => resolve2 = res);
      try {
        for (const e of await this.#fs.promises.readdir(fullpath, {
          withFileTypes: true
        })) {
          this.#readdirAddChild(e, children);
        }
        this.#readdirSuccess(children);
      } catch (er) {
        this.#readdirFail(er.code);
        children.provisional = 0;
      }
      this.#asyncReaddirInFlight = undefined;
      resolve2();
    }
    return children.slice(0, children.provisional);
  }
  readdirSync() {
    if (!this.canReaddir()) {
      return [];
    }
    const children = this.children();
    if (this.calledReaddir()) {
      return children.slice(0, children.provisional);
    }
    const fullpath = this.fullpath();
    try {
      for (const e of this.#fs.readdirSync(fullpath, {
        withFileTypes: true
      })) {
        this.#readdirAddChild(e, children);
      }
      this.#readdirSuccess(children);
    } catch (er) {
      this.#readdirFail(er.code);
      children.provisional = 0;
    }
    return children.slice(0, children.provisional);
  }
  canReaddir() {
    if (this.#type & ENOCHILD)
      return false;
    const ifmt = IFMT & this.#type;
    if (!(ifmt === UNKNOWN || ifmt === IFDIR || ifmt === IFLNK)) {
      return false;
    }
    return true;
  }
  shouldWalk(dirs, walkFilter) {
    return (this.#type & IFDIR) === IFDIR && !(this.#type & ENOCHILD) && !dirs.has(this) && (!walkFilter || walkFilter(this));
  }
  async realpath() {
    if (this.#realpath)
      return this.#realpath;
    if ((ENOREALPATH | ENOREADLINK | ENOENT) & this.#type)
      return;
    try {
      const rp = await this.#fs.promises.realpath(this.fullpath());
      return this.#realpath = this.resolve(rp);
    } catch (_) {
      this.#markENOREALPATH();
    }
  }
  realpathSync() {
    if (this.#realpath)
      return this.#realpath;
    if ((ENOREALPATH | ENOREADLINK | ENOENT) & this.#type)
      return;
    try {
      const rp = this.#fs.realpathSync(this.fullpath());
      return this.#realpath = this.resolve(rp);
    } catch (_) {
      this.#markENOREALPATH();
    }
  }
  [setAsCwd](oldCwd) {
    if (oldCwd === this)
      return;
    oldCwd.isCWD = false;
    this.isCWD = true;
    const changed = new Set([]);
    let rp = [];
    let p = this;
    while (p && p.parent) {
      changed.add(p);
      p.#relative = rp.join(this.sep);
      p.#relativePosix = rp.join("/");
      p = p.parent;
      rp.push("..");
    }
    p = oldCwd;
    while (p && p.parent && !changed.has(p)) {
      p.#relative = undefined;
      p.#relativePosix = undefined;
      p = p.parent;
    }
  }
}

class PathWin32 extends PathBase {
  sep = "\\";
  splitSep = eitherSep;
  constructor(name, type = UNKNOWN, root2, roots, nocase, children, opts) {
    super(name, type, root2, roots, nocase, children, opts);
  }
  newChild(name, type = UNKNOWN, opts = {}) {
    return new PathWin32(name, type, this.root, this.roots, this.nocase, this.childrenCache(), opts);
  }
  getRootString(path2) {
    return win32.parse(path2).root;
  }
  getRoot(rootPath) {
    rootPath = uncToDrive(rootPath.toUpperCase());
    if (rootPath === this.root.name) {
      return this.root;
    }
    for (const [compare, root2] of Object.entries(this.roots)) {
      if (this.sameRoot(rootPath, compare)) {
        return this.roots[rootPath] = root2;
      }
    }
    return this.roots[rootPath] = new PathScurryWin32(rootPath, this).root;
  }
  sameRoot(rootPath, compare = this.root.name) {
    rootPath = rootPath.toUpperCase().replace(/\//g, "\\").replace(uncDriveRegexp, "$1\\");
    return rootPath === compare;
  }
}

class PathPosix extends PathBase {
  splitSep = "/";
  sep = "/";
  constructor(name, type = UNKNOWN, root2, roots, nocase, children, opts) {
    super(name, type, root2, roots, nocase, children, opts);
  }
  getRootString(path2) {
    return path2.startsWith("/") ? "/" : "";
  }
  getRoot(_rootPath) {
    return this.root;
  }
  newChild(name, type = UNKNOWN, opts = {}) {
    return new PathPosix(name, type, this.root, this.roots, this.nocase, this.childrenCache(), opts);
  }
}

class PathScurryBase {
  root;
  rootPath;
  roots;
  cwd;
  #resolveCache;
  #resolvePosixCache;
  #children;
  nocase;
  #fs;
  constructor(cwd = process.cwd(), pathImpl, sep3, { nocase, childrenCacheSize = 16 * 1024, fs = defaultFS } = {}) {
    this.#fs = fsFromOption(fs);
    if (cwd instanceof URL || cwd.startsWith("file://")) {
      cwd = fileURLToPath(cwd);
    }
    const cwdPath = pathImpl.resolve(cwd);
    this.roots = Object.create(null);
    this.rootPath = this.parseRootPath(cwdPath);
    this.#resolveCache = new ResolveCache;
    this.#resolvePosixCache = new ResolveCache;
    this.#children = new ChildrenCache(childrenCacheSize);
    const split = cwdPath.substring(this.rootPath.length).split(sep3);
    if (split.length === 1 && !split[0]) {
      split.pop();
    }
    if (nocase === undefined) {
      throw new TypeError("must provide nocase setting to PathScurryBase ctor");
    }
    this.nocase = nocase;
    this.root = this.newRoot(this.#fs);
    this.roots[this.rootPath] = this.root;
    let prev = this.root;
    let len = split.length - 1;
    const joinSep = pathImpl.sep;
    let abs = this.rootPath;
    let sawFirst = false;
    for (const part of split) {
      const l = len--;
      prev = prev.child(part, {
        relative: new Array(l).fill("..").join(joinSep),
        relativePosix: new Array(l).fill("..").join("/"),
        fullpath: abs += (sawFirst ? "" : joinSep) + part
      });
      sawFirst = true;
    }
    this.cwd = prev;
  }
  depth(path2 = this.cwd) {
    if (typeof path2 === "string") {
      path2 = this.cwd.resolve(path2);
    }
    return path2.depth();
  }
  childrenCache() {
    return this.#children;
  }
  resolve(...paths) {
    let r = "";
    for (let i = paths.length - 1;i >= 0; i--) {
      const p = paths[i];
      if (!p || p === ".")
        continue;
      r = r ? `${p}/${r}` : p;
      if (this.isAbsolute(p)) {
        break;
      }
    }
    const cached = this.#resolveCache.get(r);
    if (cached !== undefined) {
      return cached;
    }
    const result = this.cwd.resolve(r).fullpath();
    this.#resolveCache.set(r, result);
    return result;
  }
  resolvePosix(...paths) {
    let r = "";
    for (let i = paths.length - 1;i >= 0; i--) {
      const p = paths[i];
      if (!p || p === ".")
        continue;
      r = r ? `${p}/${r}` : p;
      if (this.isAbsolute(p)) {
        break;
      }
    }
    const cached = this.#resolvePosixCache.get(r);
    if (cached !== undefined) {
      return cached;
    }
    const result = this.cwd.resolve(r).fullpathPosix();
    this.#resolvePosixCache.set(r, result);
    return result;
  }
  relative(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.relative();
  }
  relativePosix(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.relativePosix();
  }
  basename(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.name;
  }
  dirname(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return (entry.parent || entry).fullpath();
  }
  async readdir(entry = this.cwd, opts = {
    withFileTypes: true
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes } = opts;
    if (!entry.canReaddir()) {
      return [];
    } else {
      const p = await entry.readdir();
      return withFileTypes ? p : p.map((e) => e.name);
    }
  }
  readdirSync(entry = this.cwd, opts = {
    withFileTypes: true
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true } = opts;
    if (!entry.canReaddir()) {
      return [];
    } else if (withFileTypes) {
      return entry.readdirSync();
    } else {
      return entry.readdirSync().map((e) => e.name);
    }
  }
  async lstat(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.lstat();
  }
  lstatSync(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.lstatSync();
  }
  async readlink(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = await entry.readlink();
    return withFileTypes ? e : e?.fullpath();
  }
  readlinkSync(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = entry.readlinkSync();
    return withFileTypes ? e : e?.fullpath();
  }
  async realpath(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = await entry.realpath();
    return withFileTypes ? e : e?.fullpath();
  }
  realpathSync(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = entry.realpathSync();
    return withFileTypes ? e : e?.fullpath();
  }
  async walk(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = [];
    if (!filter2 || filter2(entry)) {
      results.push(withFileTypes ? entry : entry.fullpath());
    }
    const dirs = new Set;
    const walk = (dir, cb) => {
      dirs.add(dir);
      dir.readdirCB((er, entries) => {
        if (er) {
          return cb(er);
        }
        let len = entries.length;
        if (!len)
          return cb();
        const next = () => {
          if (--len === 0) {
            cb();
          }
        };
        for (const e of entries) {
          if (!filter2 || filter2(e)) {
            results.push(withFileTypes ? e : e.fullpath());
          }
          if (follow && e.isSymbolicLink()) {
            e.realpath().then((r) => r?.isUnknown() ? r.lstat() : r).then((r) => r?.shouldWalk(dirs, walkFilter) ? walk(r, next) : next());
          } else {
            if (e.shouldWalk(dirs, walkFilter)) {
              walk(e, next);
            } else {
              next();
            }
          }
        }
      }, true);
    };
    const start = entry;
    return new Promise((res, rej) => {
      walk(start, (er) => {
        if (er)
          return rej(er);
        res(results);
      });
    });
  }
  walkSync(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = [];
    if (!filter2 || filter2(entry)) {
      results.push(withFileTypes ? entry : entry.fullpath());
    }
    const dirs = new Set([entry]);
    for (const dir of dirs) {
      const entries = dir.readdirSync();
      for (const e of entries) {
        if (!filter2 || filter2(e)) {
          results.push(withFileTypes ? e : e.fullpath());
        }
        let r = e;
        if (e.isSymbolicLink()) {
          if (!(follow && (r = e.realpathSync())))
            continue;
          if (r.isUnknown())
            r.lstatSync();
        }
        if (r.shouldWalk(dirs, walkFilter)) {
          dirs.add(r);
        }
      }
    }
    return results;
  }
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
  iterate(entry = this.cwd, options = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      options = entry;
      entry = this.cwd;
    }
    return this.stream(entry, options)[Symbol.asyncIterator]();
  }
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  *iterateSync(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    if (!filter2 || filter2(entry)) {
      yield withFileTypes ? entry : entry.fullpath();
    }
    const dirs = new Set([entry]);
    for (const dir of dirs) {
      const entries = dir.readdirSync();
      for (const e of entries) {
        if (!filter2 || filter2(e)) {
          yield withFileTypes ? e : e.fullpath();
        }
        let r = e;
        if (e.isSymbolicLink()) {
          if (!(follow && (r = e.realpathSync())))
            continue;
          if (r.isUnknown())
            r.lstatSync();
        }
        if (r.shouldWalk(dirs, walkFilter)) {
          dirs.add(r);
        }
      }
    }
  }
  stream(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = new Minipass({ objectMode: true });
    if (!filter2 || filter2(entry)) {
      results.write(withFileTypes ? entry : entry.fullpath());
    }
    const dirs = new Set;
    const queue = [entry];
    let processing = 0;
    const process2 = () => {
      let paused = false;
      while (!paused) {
        const dir = queue.shift();
        if (!dir) {
          if (processing === 0)
            results.end();
          return;
        }
        processing++;
        dirs.add(dir);
        const onReaddir = (er, entries, didRealpaths = false) => {
          if (er)
            return results.emit("error", er);
          if (follow && !didRealpaths) {
            const promises = [];
            for (const e of entries) {
              if (e.isSymbolicLink()) {
                promises.push(e.realpath().then((r) => r?.isUnknown() ? r.lstat() : r));
              }
            }
            if (promises.length) {
              Promise.all(promises).then(() => onReaddir(null, entries, true));
              return;
            }
          }
          for (const e of entries) {
            if (e && (!filter2 || filter2(e))) {
              if (!results.write(withFileTypes ? e : e.fullpath())) {
                paused = true;
              }
            }
          }
          processing--;
          for (const e of entries) {
            const r = e.realpathCached() || e;
            if (r.shouldWalk(dirs, walkFilter)) {
              queue.push(r);
            }
          }
          if (paused && !results.flowing) {
            results.once("drain", process2);
          } else if (!sync) {
            process2();
          }
        };
        let sync = true;
        dir.readdirCB(onReaddir, true);
        sync = false;
      }
    };
    process2();
    return results;
  }
  streamSync(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = new Minipass({ objectMode: true });
    const dirs = new Set;
    if (!filter2 || filter2(entry)) {
      results.write(withFileTypes ? entry : entry.fullpath());
    }
    const queue = [entry];
    let processing = 0;
    const process2 = () => {
      let paused = false;
      while (!paused) {
        const dir = queue.shift();
        if (!dir) {
          if (processing === 0)
            results.end();
          return;
        }
        processing++;
        dirs.add(dir);
        const entries = dir.readdirSync();
        for (const e of entries) {
          if (!filter2 || filter2(e)) {
            if (!results.write(withFileTypes ? e : e.fullpath())) {
              paused = true;
            }
          }
        }
        processing--;
        for (const e of entries) {
          let r = e;
          if (e.isSymbolicLink()) {
            if (!(follow && (r = e.realpathSync())))
              continue;
            if (r.isUnknown())
              r.lstatSync();
          }
          if (r.shouldWalk(dirs, walkFilter)) {
            queue.push(r);
          }
        }
      }
      if (paused && !results.flowing)
        results.once("drain", process2);
    };
    process2();
    return results;
  }
  chdir(path2 = this.cwd) {
    const oldCwd = this.cwd;
    this.cwd = typeof path2 === "string" ? this.cwd.resolve(path2) : path2;
    this.cwd[setAsCwd](oldCwd);
  }
}

class PathScurryWin32 extends PathScurryBase {
  sep = "\\";
  constructor(cwd = process.cwd(), opts = {}) {
    const { nocase = true } = opts;
    super(cwd, win32, "\\", { ...opts, nocase });
    this.nocase = nocase;
    for (let p = this.cwd;p; p = p.parent) {
      p.nocase = this.nocase;
    }
  }
  parseRootPath(dir) {
    return win32.parse(dir).root.toUpperCase();
  }
  newRoot(fs) {
    return new PathWin32(this.rootPath, IFDIR, undefined, this.roots, this.nocase, this.childrenCache(), { fs });
  }
  isAbsolute(p) {
    return p.startsWith("/") || p.startsWith("\\") || /^[a-z]:(\/|\\)/i.test(p);
  }
}

class PathScurryPosix extends PathScurryBase {
  sep = "/";
  constructor(cwd = process.cwd(), opts = {}) {
    const { nocase = false } = opts;
    super(cwd, posix, "/", { ...opts, nocase });
    this.nocase = nocase;
  }
  parseRootPath(_dir) {
    return "/";
  }
  newRoot(fs) {
    return new PathPosix(this.rootPath, IFDIR, undefined, this.roots, this.nocase, this.childrenCache(), { fs });
  }
  isAbsolute(p) {
    return p.startsWith("/");
  }
}

class PathScurryDarwin extends PathScurryPosix {
  constructor(cwd = process.cwd(), opts = {}) {
    const { nocase = true } = opts;
    super(cwd, { ...opts, nocase });
  }
}
var Path = process.platform === "win32" ? PathWin32 : PathPosix;
var PathScurry = process.platform === "win32" ? PathScurryWin32 : process.platform === "darwin" ? PathScurryDarwin : PathScurryPosix;

// node_modules/glob/dist/esm/pattern.js
var isPatternList = (pl) => pl.length >= 1;
var isGlobList = (gl) => gl.length >= 1;

class Pattern {
  #patternList;
  #globList;
  #index;
  length;
  #platform;
  #rest;
  #globString;
  #isDrive;
  #isUNC;
  #isAbsolute;
  #followGlobstar = true;
  constructor(patternList, globList, index, platform2) {
    if (!isPatternList(patternList)) {
      throw new TypeError("empty pattern list");
    }
    if (!isGlobList(globList)) {
      throw new TypeError("empty glob list");
    }
    if (globList.length !== patternList.length) {
      throw new TypeError("mismatched pattern list and glob list lengths");
    }
    this.length = patternList.length;
    if (index < 0 || index >= this.length) {
      throw new TypeError("index out of range");
    }
    this.#patternList = patternList;
    this.#globList = globList;
    this.#index = index;
    this.#platform = platform2;
    if (this.#index === 0) {
      if (this.isUNC()) {
        const [p0, p1, p2, p3, ...prest] = this.#patternList;
        const [g0, g1, g2, g3, ...grest] = this.#globList;
        if (prest[0] === "") {
          prest.shift();
          grest.shift();
        }
        const p = [p0, p1, p2, p3, ""].join("/");
        const g = [g0, g1, g2, g3, ""].join("/");
        this.#patternList = [p, ...prest];
        this.#globList = [g, ...grest];
        this.length = this.#patternList.length;
      } else if (this.isDrive() || this.isAbsolute()) {
        const [p1, ...prest] = this.#patternList;
        const [g1, ...grest] = this.#globList;
        if (prest[0] === "") {
          prest.shift();
          grest.shift();
        }
        const p = p1 + "/";
        const g = g1 + "/";
        this.#patternList = [p, ...prest];
        this.#globList = [g, ...grest];
        this.length = this.#patternList.length;
      }
    }
  }
  pattern() {
    return this.#patternList[this.#index];
  }
  isString() {
    return typeof this.#patternList[this.#index] === "string";
  }
  isGlobstar() {
    return this.#patternList[this.#index] === GLOBSTAR;
  }
  isRegExp() {
    return this.#patternList[this.#index] instanceof RegExp;
  }
  globString() {
    return this.#globString = this.#globString || (this.#index === 0 ? this.isAbsolute() ? this.#globList[0] + this.#globList.slice(1).join("/") : this.#globList.join("/") : this.#globList.slice(this.#index).join("/"));
  }
  hasMore() {
    return this.length > this.#index + 1;
  }
  rest() {
    if (this.#rest !== undefined)
      return this.#rest;
    if (!this.hasMore())
      return this.#rest = null;
    this.#rest = new Pattern(this.#patternList, this.#globList, this.#index + 1, this.#platform);
    this.#rest.#isAbsolute = this.#isAbsolute;
    this.#rest.#isUNC = this.#isUNC;
    this.#rest.#isDrive = this.#isDrive;
    return this.#rest;
  }
  isUNC() {
    const pl = this.#patternList;
    return this.#isUNC !== undefined ? this.#isUNC : this.#isUNC = this.#platform === "win32" && this.#index === 0 && pl[0] === "" && pl[1] === "" && typeof pl[2] === "string" && !!pl[2] && typeof pl[3] === "string" && !!pl[3];
  }
  isDrive() {
    const pl = this.#patternList;
    return this.#isDrive !== undefined ? this.#isDrive : this.#isDrive = this.#platform === "win32" && this.#index === 0 && this.length > 1 && typeof pl[0] === "string" && /^[a-z]:$/i.test(pl[0]);
  }
  isAbsolute() {
    const pl = this.#patternList;
    return this.#isAbsolute !== undefined ? this.#isAbsolute : this.#isAbsolute = pl[0] === "" && pl.length > 1 || this.isDrive() || this.isUNC();
  }
  root() {
    const p = this.#patternList[0];
    return typeof p === "string" && this.isAbsolute() && this.#index === 0 ? p : "";
  }
  checkFollowGlobstar() {
    return !(this.#index === 0 || !this.isGlobstar() || !this.#followGlobstar);
  }
  markFollowGlobstar() {
    if (this.#index === 0 || !this.isGlobstar() || !this.#followGlobstar)
      return false;
    this.#followGlobstar = false;
    return true;
  }
}

// node_modules/glob/dist/esm/ignore.js
var defaultPlatform2 = typeof process === "object" && process && typeof process.platform === "string" ? process.platform : "linux";

class Ignore {
  relative;
  relativeChildren;
  absolute;
  absoluteChildren;
  platform;
  mmopts;
  constructor(ignored, { nobrace, nocase, noext, noglobstar, platform: platform2 = defaultPlatform2 }) {
    this.relative = [];
    this.absolute = [];
    this.relativeChildren = [];
    this.absoluteChildren = [];
    this.platform = platform2;
    this.mmopts = {
      dot: true,
      nobrace,
      nocase,
      noext,
      noglobstar,
      optimizationLevel: 2,
      platform: platform2,
      nocomment: true,
      nonegate: true
    };
    for (const ign of ignored)
      this.add(ign);
  }
  add(ign) {
    const mm = new Minimatch(ign, this.mmopts);
    for (let i = 0;i < mm.set.length; i++) {
      const parsed = mm.set[i];
      const globParts = mm.globParts[i];
      if (!parsed || !globParts) {
        throw new Error("invalid pattern object");
      }
      while (parsed[0] === "." && globParts[0] === ".") {
        parsed.shift();
        globParts.shift();
      }
      const p = new Pattern(parsed, globParts, 0, this.platform);
      const m = new Minimatch(p.globString(), this.mmopts);
      const children = globParts[globParts.length - 1] === "**";
      const absolute = p.isAbsolute();
      if (absolute)
        this.absolute.push(m);
      else
        this.relative.push(m);
      if (children) {
        if (absolute)
          this.absoluteChildren.push(m);
        else
          this.relativeChildren.push(m);
      }
    }
  }
  ignored(p) {
    const fullpath = p.fullpath();
    const fullpaths = `${fullpath}/`;
    const relative2 = p.relative() || ".";
    const relatives = `${relative2}/`;
    for (const m of this.relative) {
      if (m.match(relative2) || m.match(relatives))
        return true;
    }
    for (const m of this.absolute) {
      if (m.match(fullpath) || m.match(fullpaths))
        return true;
    }
    return false;
  }
  childrenIgnored(p) {
    const fullpath = p.fullpath() + "/";
    const relative2 = (p.relative() || ".") + "/";
    for (const m of this.relativeChildren) {
      if (m.match(relative2))
        return true;
    }
    for (const m of this.absoluteChildren) {
      if (m.match(fullpath))
        return true;
    }
    return false;
  }
}

// node_modules/glob/dist/esm/processor.js
class HasWalkedCache {
  store;
  constructor(store = new Map) {
    this.store = store;
  }
  copy() {
    return new HasWalkedCache(new Map(this.store));
  }
  hasWalked(target, pattern) {
    return this.store.get(target.fullpath())?.has(pattern.globString());
  }
  storeWalked(target, pattern) {
    const fullpath = target.fullpath();
    const cached = this.store.get(fullpath);
    if (cached)
      cached.add(pattern.globString());
    else
      this.store.set(fullpath, new Set([pattern.globString()]));
  }
}

class MatchRecord {
  store = new Map;
  add(target, absolute, ifDir) {
    const n2 = (absolute ? 2 : 0) | (ifDir ? 1 : 0);
    const current = this.store.get(target);
    this.store.set(target, current === undefined ? n2 : n2 & current);
  }
  entries() {
    return [...this.store.entries()].map(([path2, n2]) => [
      path2,
      !!(n2 & 2),
      !!(n2 & 1)
    ]);
  }
}

class SubWalks {
  store = new Map;
  add(target, pattern) {
    if (!target.canReaddir()) {
      return;
    }
    const subs = this.store.get(target);
    if (subs) {
      if (!subs.find((p) => p.globString() === pattern.globString())) {
        subs.push(pattern);
      }
    } else
      this.store.set(target, [pattern]);
  }
  get(target) {
    const subs = this.store.get(target);
    if (!subs) {
      throw new Error("attempting to walk unknown path");
    }
    return subs;
  }
  entries() {
    return this.keys().map((k) => [k, this.store.get(k)]);
  }
  keys() {
    return [...this.store.keys()].filter((t) => t.canReaddir());
  }
}

class Processor {
  hasWalkedCache;
  matches = new MatchRecord;
  subwalks = new SubWalks;
  patterns;
  follow;
  dot;
  opts;
  constructor(opts, hasWalkedCache) {
    this.opts = opts;
    this.follow = !!opts.follow;
    this.dot = !!opts.dot;
    this.hasWalkedCache = hasWalkedCache ? hasWalkedCache.copy() : new HasWalkedCache;
  }
  processPatterns(target, patterns) {
    this.patterns = patterns;
    const processingSet = patterns.map((p) => [target, p]);
    for (let [t, pattern] of processingSet) {
      this.hasWalkedCache.storeWalked(t, pattern);
      const root2 = pattern.root();
      const absolute = pattern.isAbsolute() && this.opts.absolute !== false;
      if (root2) {
        t = t.resolve(root2 === "/" && this.opts.root !== undefined ? this.opts.root : root2);
        const rest2 = pattern.rest();
        if (!rest2) {
          this.matches.add(t, true, false);
          continue;
        } else {
          pattern = rest2;
        }
      }
      if (t.isENOENT())
        continue;
      let p;
      let rest;
      let changed = false;
      while (typeof (p = pattern.pattern()) === "string" && (rest = pattern.rest())) {
        const c = t.resolve(p);
        t = c;
        pattern = rest;
        changed = true;
      }
      p = pattern.pattern();
      rest = pattern.rest();
      if (changed) {
        if (this.hasWalkedCache.hasWalked(t, pattern))
          continue;
        this.hasWalkedCache.storeWalked(t, pattern);
      }
      if (typeof p === "string") {
        const ifDir = p === ".." || p === "" || p === ".";
        this.matches.add(t.resolve(p), absolute, ifDir);
        continue;
      } else if (p === GLOBSTAR) {
        if (!t.isSymbolicLink() || this.follow || pattern.checkFollowGlobstar()) {
          this.subwalks.add(t, pattern);
        }
        const rp = rest?.pattern();
        const rrest = rest?.rest();
        if (!rest || (rp === "" || rp === ".") && !rrest) {
          this.matches.add(t, absolute, rp === "" || rp === ".");
        } else {
          if (rp === "..") {
            const tp = t.parent || t;
            if (!rrest)
              this.matches.add(tp, absolute, true);
            else if (!this.hasWalkedCache.hasWalked(tp, rrest)) {
              this.subwalks.add(tp, rrest);
            }
          }
        }
      } else if (p instanceof RegExp) {
        this.subwalks.add(t, pattern);
      }
    }
    return this;
  }
  subwalkTargets() {
    return this.subwalks.keys();
  }
  child() {
    return new Processor(this.opts, this.hasWalkedCache);
  }
  filterEntries(parent, entries) {
    const patterns = this.subwalks.get(parent);
    const results = this.child();
    for (const e of entries) {
      for (const pattern of patterns) {
        const absolute = pattern.isAbsolute();
        const p = pattern.pattern();
        const rest = pattern.rest();
        if (p === GLOBSTAR) {
          results.testGlobstar(e, pattern, rest, absolute);
        } else if (p instanceof RegExp) {
          results.testRegExp(e, p, rest, absolute);
        } else {
          results.testString(e, p, rest, absolute);
        }
      }
    }
    return results;
  }
  testGlobstar(e, pattern, rest, absolute) {
    if (this.dot || !e.name.startsWith(".")) {
      if (!pattern.hasMore()) {
        this.matches.add(e, absolute, false);
      }
      if (e.canReaddir()) {
        if (this.follow || !e.isSymbolicLink()) {
          this.subwalks.add(e, pattern);
        } else if (e.isSymbolicLink()) {
          if (rest && pattern.checkFollowGlobstar()) {
            this.subwalks.add(e, rest);
          } else if (pattern.markFollowGlobstar()) {
            this.subwalks.add(e, pattern);
          }
        }
      }
    }
    if (rest) {
      const rp = rest.pattern();
      if (typeof rp === "string" && rp !== ".." && rp !== "" && rp !== ".") {
        this.testString(e, rp, rest.rest(), absolute);
      } else if (rp === "..") {
        const ep = e.parent || e;
        this.subwalks.add(ep, rest);
      } else if (rp instanceof RegExp) {
        this.testRegExp(e, rp, rest.rest(), absolute);
      }
    }
  }
  testRegExp(e, p, rest, absolute) {
    if (!p.test(e.name))
      return;
    if (!rest) {
      this.matches.add(e, absolute, false);
    } else {
      this.subwalks.add(e, rest);
    }
  }
  testString(e, p, rest, absolute) {
    if (!e.isNamed(p))
      return;
    if (!rest) {
      this.matches.add(e, absolute, false);
    } else {
      this.subwalks.add(e, rest);
    }
  }
}

// node_modules/glob/dist/esm/walker.js
var makeIgnore = (ignore, opts) => typeof ignore === "string" ? new Ignore([ignore], opts) : Array.isArray(ignore) ? new Ignore(ignore, opts) : ignore;

class GlobUtil {
  path;
  patterns;
  opts;
  seen = new Set;
  paused = false;
  aborted = false;
  #onResume = [];
  #ignore;
  #sep;
  signal;
  maxDepth;
  includeChildMatches;
  constructor(patterns, path2, opts) {
    this.patterns = patterns;
    this.path = path2;
    this.opts = opts;
    this.#sep = !opts.posix && opts.platform === "win32" ? "\\" : "/";
    this.includeChildMatches = opts.includeChildMatches !== false;
    if (opts.ignore || !this.includeChildMatches) {
      this.#ignore = makeIgnore(opts.ignore ?? [], opts);
      if (!this.includeChildMatches && typeof this.#ignore.add !== "function") {
        const m = "cannot ignore child matches, ignore lacks add() method.";
        throw new Error(m);
      }
    }
    this.maxDepth = opts.maxDepth || Infinity;
    if (opts.signal) {
      this.signal = opts.signal;
      this.signal.addEventListener("abort", () => {
        this.#onResume.length = 0;
      });
    }
  }
  #ignored(path2) {
    return this.seen.has(path2) || !!this.#ignore?.ignored?.(path2);
  }
  #childrenIgnored(path2) {
    return !!this.#ignore?.childrenIgnored?.(path2);
  }
  pause() {
    this.paused = true;
  }
  resume() {
    if (this.signal?.aborted)
      return;
    this.paused = false;
    let fn = undefined;
    while (!this.paused && (fn = this.#onResume.shift())) {
      fn();
    }
  }
  onResume(fn) {
    if (this.signal?.aborted)
      return;
    if (!this.paused) {
      fn();
    } else {
      this.#onResume.push(fn);
    }
  }
  async matchCheck(e, ifDir) {
    if (ifDir && this.opts.nodir)
      return;
    let rpc;
    if (this.opts.realpath) {
      rpc = e.realpathCached() || await e.realpath();
      if (!rpc)
        return;
      e = rpc;
    }
    const needStat = e.isUnknown() || this.opts.stat;
    const s = needStat ? await e.lstat() : e;
    if (this.opts.follow && this.opts.nodir && s?.isSymbolicLink()) {
      const target = await s.realpath();
      if (target && (target.isUnknown() || this.opts.stat)) {
        await target.lstat();
      }
    }
    return this.matchCheckTest(s, ifDir);
  }
  matchCheckTest(e, ifDir) {
    return e && (this.maxDepth === Infinity || e.depth() <= this.maxDepth) && (!ifDir || e.canReaddir()) && (!this.opts.nodir || !e.isDirectory()) && (!this.opts.nodir || !this.opts.follow || !e.isSymbolicLink() || !e.realpathCached()?.isDirectory()) && !this.#ignored(e) ? e : undefined;
  }
  matchCheckSync(e, ifDir) {
    if (ifDir && this.opts.nodir)
      return;
    let rpc;
    if (this.opts.realpath) {
      rpc = e.realpathCached() || e.realpathSync();
      if (!rpc)
        return;
      e = rpc;
    }
    const needStat = e.isUnknown() || this.opts.stat;
    const s = needStat ? e.lstatSync() : e;
    if (this.opts.follow && this.opts.nodir && s?.isSymbolicLink()) {
      const target = s.realpathSync();
      if (target && (target?.isUnknown() || this.opts.stat)) {
        target.lstatSync();
      }
    }
    return this.matchCheckTest(s, ifDir);
  }
  matchFinish(e, absolute) {
    if (this.#ignored(e))
      return;
    if (!this.includeChildMatches && this.#ignore?.add) {
      const ign = `${e.relativePosix()}/**`;
      this.#ignore.add(ign);
    }
    const abs = this.opts.absolute === undefined ? absolute : this.opts.absolute;
    this.seen.add(e);
    const mark = this.opts.mark && e.isDirectory() ? this.#sep : "";
    if (this.opts.withFileTypes) {
      this.matchEmit(e);
    } else if (abs) {
      const abs2 = this.opts.posix ? e.fullpathPosix() : e.fullpath();
      this.matchEmit(abs2 + mark);
    } else {
      const rel = this.opts.posix ? e.relativePosix() : e.relative();
      const pre = this.opts.dotRelative && !rel.startsWith(".." + this.#sep) ? "." + this.#sep : "";
      this.matchEmit(!rel ? "." + mark : pre + rel + mark);
    }
  }
  async match(e, absolute, ifDir) {
    const p = await this.matchCheck(e, ifDir);
    if (p)
      this.matchFinish(p, absolute);
  }
  matchSync(e, absolute, ifDir) {
    const p = this.matchCheckSync(e, ifDir);
    if (p)
      this.matchFinish(p, absolute);
  }
  walkCB(target, patterns, cb) {
    if (this.signal?.aborted)
      cb();
    this.walkCB2(target, patterns, new Processor(this.opts), cb);
  }
  walkCB2(target, patterns, processor, cb) {
    if (this.#childrenIgnored(target))
      return cb();
    if (this.signal?.aborted)
      cb();
    if (this.paused) {
      this.onResume(() => this.walkCB2(target, patterns, processor, cb));
      return;
    }
    processor.processPatterns(target, patterns);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      tasks++;
      this.match(m, absolute, ifDir).then(() => next());
    }
    for (const t of processor.subwalkTargets()) {
      if (this.maxDepth !== Infinity && t.depth() >= this.maxDepth) {
        continue;
      }
      tasks++;
      const childrenCached = t.readdirCached();
      if (t.calledReaddir())
        this.walkCB3(t, childrenCached, processor, next);
      else {
        t.readdirCB((_, entries) => this.walkCB3(t, entries, processor, next), true);
      }
    }
    next();
  }
  walkCB3(target, entries, processor, cb) {
    processor = processor.filterEntries(target, entries);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      tasks++;
      this.match(m, absolute, ifDir).then(() => next());
    }
    for (const [target2, patterns] of processor.subwalks.entries()) {
      tasks++;
      this.walkCB2(target2, patterns, processor.child(), next);
    }
    next();
  }
  walkCBSync(target, patterns, cb) {
    if (this.signal?.aborted)
      cb();
    this.walkCB2Sync(target, patterns, new Processor(this.opts), cb);
  }
  walkCB2Sync(target, patterns, processor, cb) {
    if (this.#childrenIgnored(target))
      return cb();
    if (this.signal?.aborted)
      cb();
    if (this.paused) {
      this.onResume(() => this.walkCB2Sync(target, patterns, processor, cb));
      return;
    }
    processor.processPatterns(target, patterns);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      this.matchSync(m, absolute, ifDir);
    }
    for (const t of processor.subwalkTargets()) {
      if (this.maxDepth !== Infinity && t.depth() >= this.maxDepth) {
        continue;
      }
      tasks++;
      const children = t.readdirSync();
      this.walkCB3Sync(t, children, processor, next);
    }
    next();
  }
  walkCB3Sync(target, entries, processor, cb) {
    processor = processor.filterEntries(target, entries);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      this.matchSync(m, absolute, ifDir);
    }
    for (const [target2, patterns] of processor.subwalks.entries()) {
      tasks++;
      this.walkCB2Sync(target2, patterns, processor.child(), next);
    }
    next();
  }
}

class GlobWalker extends GlobUtil {
  matches = new Set;
  constructor(patterns, path2, opts) {
    super(patterns, path2, opts);
  }
  matchEmit(e) {
    this.matches.add(e);
  }
  async walk() {
    if (this.signal?.aborted)
      throw this.signal.reason;
    if (this.path.isUnknown()) {
      await this.path.lstat();
    }
    await new Promise((res, rej) => {
      this.walkCB(this.path, this.patterns, () => {
        if (this.signal?.aborted) {
          rej(this.signal.reason);
        } else {
          res(this.matches);
        }
      });
    });
    return this.matches;
  }
  walkSync() {
    if (this.signal?.aborted)
      throw this.signal.reason;
    if (this.path.isUnknown()) {
      this.path.lstatSync();
    }
    this.walkCBSync(this.path, this.patterns, () => {
      if (this.signal?.aborted)
        throw this.signal.reason;
    });
    return this.matches;
  }
}

class GlobStream extends GlobUtil {
  results;
  constructor(patterns, path2, opts) {
    super(patterns, path2, opts);
    this.results = new Minipass({
      signal: this.signal,
      objectMode: true
    });
    this.results.on("drain", () => this.resume());
    this.results.on("resume", () => this.resume());
  }
  matchEmit(e) {
    this.results.write(e);
    if (!this.results.flowing)
      this.pause();
  }
  stream() {
    const target = this.path;
    if (target.isUnknown()) {
      target.lstat().then(() => {
        this.walkCB(target, this.patterns, () => this.results.end());
      });
    } else {
      this.walkCB(target, this.patterns, () => this.results.end());
    }
    return this.results;
  }
  streamSync() {
    if (this.path.isUnknown()) {
      this.path.lstatSync();
    }
    this.walkCBSync(this.path, this.patterns, () => this.results.end());
    return this.results;
  }
}

// node_modules/glob/dist/esm/glob.js
var defaultPlatform3 = typeof process === "object" && process && typeof process.platform === "string" ? process.platform : "linux";

class Glob {
  absolute;
  cwd;
  root;
  dot;
  dotRelative;
  follow;
  ignore;
  magicalBraces;
  mark;
  matchBase;
  maxDepth;
  nobrace;
  nocase;
  nodir;
  noext;
  noglobstar;
  pattern;
  platform;
  realpath;
  scurry;
  stat;
  signal;
  windowsPathsNoEscape;
  withFileTypes;
  includeChildMatches;
  opts;
  patterns;
  constructor(pattern, opts) {
    if (!opts)
      throw new TypeError("glob options required");
    this.withFileTypes = !!opts.withFileTypes;
    this.signal = opts.signal;
    this.follow = !!opts.follow;
    this.dot = !!opts.dot;
    this.dotRelative = !!opts.dotRelative;
    this.nodir = !!opts.nodir;
    this.mark = !!opts.mark;
    if (!opts.cwd) {
      this.cwd = "";
    } else if (opts.cwd instanceof URL || opts.cwd.startsWith("file://")) {
      opts.cwd = fileURLToPath2(opts.cwd);
    }
    this.cwd = opts.cwd || "";
    this.root = opts.root;
    this.magicalBraces = !!opts.magicalBraces;
    this.nobrace = !!opts.nobrace;
    this.noext = !!opts.noext;
    this.realpath = !!opts.realpath;
    this.absolute = opts.absolute;
    this.includeChildMatches = opts.includeChildMatches !== false;
    this.noglobstar = !!opts.noglobstar;
    this.matchBase = !!opts.matchBase;
    this.maxDepth = typeof opts.maxDepth === "number" ? opts.maxDepth : Infinity;
    this.stat = !!opts.stat;
    this.ignore = opts.ignore;
    if (this.withFileTypes && this.absolute !== undefined) {
      throw new Error("cannot set absolute and withFileTypes:true");
    }
    if (typeof pattern === "string") {
      pattern = [pattern];
    }
    this.windowsPathsNoEscape = !!opts.windowsPathsNoEscape || opts.allowWindowsEscape === false;
    if (this.windowsPathsNoEscape) {
      pattern = pattern.map((p) => p.replace(/\\/g, "/"));
    }
    if (this.matchBase) {
      if (opts.noglobstar) {
        throw new TypeError("base matching requires globstar");
      }
      pattern = pattern.map((p) => p.includes("/") ? p : `./**/${p}`);
    }
    this.pattern = pattern;
    this.platform = opts.platform || defaultPlatform3;
    this.opts = { ...opts, platform: this.platform };
    if (opts.scurry) {
      this.scurry = opts.scurry;
      if (opts.nocase !== undefined && opts.nocase !== opts.scurry.nocase) {
        throw new Error("nocase option contradicts provided scurry option");
      }
    } else {
      const Scurry = opts.platform === "win32" ? PathScurryWin32 : opts.platform === "darwin" ? PathScurryDarwin : opts.platform ? PathScurryPosix : PathScurry;
      this.scurry = new Scurry(this.cwd, {
        nocase: opts.nocase,
        fs: opts.fs
      });
    }
    this.nocase = this.scurry.nocase;
    const nocaseMagicOnly = this.platform === "darwin" || this.platform === "win32";
    const mmo = {
      ...opts,
      dot: this.dot,
      matchBase: this.matchBase,
      nobrace: this.nobrace,
      nocase: this.nocase,
      nocaseMagicOnly,
      nocomment: true,
      noext: this.noext,
      nonegate: true,
      optimizationLevel: 2,
      platform: this.platform,
      windowsPathsNoEscape: this.windowsPathsNoEscape,
      debug: !!this.opts.debug
    };
    const mms = this.pattern.map((p) => new Minimatch(p, mmo));
    const [matchSet, globParts] = mms.reduce((set, m) => {
      set[0].push(...m.set);
      set[1].push(...m.globParts);
      return set;
    }, [[], []]);
    this.patterns = matchSet.map((set, i) => {
      const g = globParts[i];
      if (!g)
        throw new Error("invalid pattern object");
      return new Pattern(set, g, 0, this.platform);
    });
  }
  async walk() {
    return [
      ...await new GlobWalker(this.patterns, this.scurry.cwd, {
        ...this.opts,
        maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
        platform: this.platform,
        nocase: this.nocase,
        includeChildMatches: this.includeChildMatches
      }).walk()
    ];
  }
  walkSync() {
    return [
      ...new GlobWalker(this.patterns, this.scurry.cwd, {
        ...this.opts,
        maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
        platform: this.platform,
        nocase: this.nocase,
        includeChildMatches: this.includeChildMatches
      }).walkSync()
    ];
  }
  stream() {
    return new GlobStream(this.patterns, this.scurry.cwd, {
      ...this.opts,
      maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
      platform: this.platform,
      nocase: this.nocase,
      includeChildMatches: this.includeChildMatches
    }).stream();
  }
  streamSync() {
    return new GlobStream(this.patterns, this.scurry.cwd, {
      ...this.opts,
      maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
      platform: this.platform,
      nocase: this.nocase,
      includeChildMatches: this.includeChildMatches
    }).streamSync();
  }
  iterateSync() {
    return this.streamSync()[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  iterate() {
    return this.stream()[Symbol.asyncIterator]();
  }
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
}

// node_modules/glob/dist/esm/has-magic.js
var hasMagic = (pattern, options = {}) => {
  if (!Array.isArray(pattern)) {
    pattern = [pattern];
  }
  for (const p of pattern) {
    if (new Minimatch(p, options).hasMagic())
      return true;
  }
  return false;
};

// node_modules/glob/dist/esm/index.js
function globStreamSync(pattern, options = {}) {
  return new Glob(pattern, options).streamSync();
}
function globStream(pattern, options = {}) {
  return new Glob(pattern, options).stream();
}
function globSync(pattern, options = {}) {
  return new Glob(pattern, options).walkSync();
}
async function glob_(pattern, options = {}) {
  return new Glob(pattern, options).walk();
}
function globIterateSync(pattern, options = {}) {
  return new Glob(pattern, options).iterateSync();
}
function globIterate(pattern, options = {}) {
  return new Glob(pattern, options).iterate();
}
var streamSync = globStreamSync;
var stream = Object.assign(globStream, { sync: globStreamSync });
var iterateSync = globIterateSync;
var iterate = Object.assign(globIterate, {
  sync: globIterateSync
});
var sync = Object.assign(globSync, {
  stream: globStreamSync,
  iterate: globIterateSync
});
var glob = Object.assign(glob_, {
  glob: glob_,
  globSync,
  sync,
  globStream,
  stream,
  globStreamSync,
  streamSync,
  globIterate,
  iterate,
  globIterateSync,
  iterateSync,
  Glob,
  hasMagic,
  escape,
  unescape
});
glob.glob = glob;

// src/core/intent.ts
class UnsupportedIntentError extends Error {
  errorCode = "UNSUPPORTED_OPERATION";
  constructor(message) {
    super(message);
    this.name = "UnsupportedIntentError";
  }
}
function parseIntent(raw) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${raw}`);
  }
  if (!obj.operation)
    throw new Error("Intent requires 'operation' field");
  if (!obj.symbol || typeof obj.symbol !== "string") {
    throw new Error("Intent requires 'symbol' field (string)");
  }
  switch (obj.operation) {
    case "add-parameter": {
      if (!obj.param || !obj.param.name)
        throw new Error("add-parameter requires 'param.name'");
      return {
        operation: "add-parameter",
        symbol: obj.symbol,
        param: {
          name: obj.param.name,
          type: obj.param.type,
          default: obj.param.default
        },
        file: obj.file
      };
    }
    case "remove-parameter": {
      throw new UnsupportedIntentError("remove-parameter is not implemented. Use rename-exported-symbol, or edit the signature with `ast replace-body` and each call site with `diff apply`.");
    }
    case "rename-exported-symbol": {
      if (!obj.newName)
        throw new Error("rename-exported-symbol requires 'newName'");
      return {
        operation: "rename-exported-symbol",
        symbol: obj.symbol,
        newName: obj.newName,
        file: obj.file
      };
    }
    default:
      throw new Error(`Unknown intent operation: ${obj.operation}. Supported: add-parameter, rename-exported-symbol`);
  }
}
var LANG_EXTS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.py", "**/*.go", "**/*.rs"];
var IGNORE_GLOBS = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/__pycache__/**", "**/target/**", "**/vendor/**"];
async function findSymbolDefinition(symbol, projectRoot, hintFile) {
  if (hintFile) {
    try {
      const source = await Bun.file(hintFile).text();
      const symbols = findSymbols(source, hintFile);
      const match2 = symbols.find((s) => s.name === symbol);
      if (match2) {
        return {
          file: hintFile,
          name: match2.name,
          kind: match2.kind,
          line: match2.startRow + 1,
          column: match2.startCol + 1
        };
      }
    } catch {}
  }
  const sourceFiles = await glob(LANG_EXTS, { cwd: projectRoot, ignore: IGNORE_GLOBS });
  for (const relPath of sourceFiles) {
    const absPath = `${projectRoot}/${relPath}`;
    try {
      const source = await Bun.file(absPath).text();
      const symbols = findSymbols(source, absPath);
      const match2 = symbols.find((s) => s.name === symbol);
      if (match2) {
        return {
          file: absPath,
          name: match2.name,
          kind: match2.kind,
          line: match2.startRow + 1,
          column: match2.startCol + 1
        };
      }
    } catch {}
  }
  return null;
}
var DEF_PATTERNS = [
  /^(export\s+)?(async\s+)?function\s+/,
  /^(export\s+)?(const|let|var)\s+/,
  /^(export\s+)?class\s+/,
  /^(export\s+)?interface\s+/,
  /^(export\s+)?type\s+/,
  /^def\s+/,
  /^func\s+/,
  /^pub\s+fn\s+/
];
function isDefinitionLine(content, symbol) {
  return DEF_PATTERNS.some((p) => p.test(content) && content.includes(symbol));
}
async function findReferences(symbol, projectRoot, _definitionFile) {
  const sourceFiles = await glob(LANG_EXTS, { cwd: projectRoot, ignore: IGNORE_GLOBS });
  if (sourceFiles.length === 0)
    return [];
  const absPaths = sourceFiles.map((f) => `${projectRoot}/${f}`);
  const grepResult = await grepMany(escapeRegex(symbol), absPaths, {
    maxResults: 500,
    wordMatch: true
  });
  if (grepResult.error)
    return [];
  const references = [];
  for (const r of grepResult.results) {
    if (isDefinitionLine(r.content.trim(), symbol))
      continue;
    references.push({ file: r.path, line: r.line, column: r.column, context: r.content.trim() });
  }
  return references;
}
function generatePlan(intent, definition, references) {
  const steps = [];
  const unresolved = [];
  switch (intent.operation) {
    case "add-parameter": {
      const paramParts = [intent.param.name];
      if (intent.param.type)
        paramParts.push(intent.param.type);
      const paramStr = paramParts.join(": ");
      const defaultVal = intent.param.default ?? undefined;
      steps.push({
        order: 0,
        file: definition.file,
        operation: "insert-parameter",
        description: `Add parameter '${paramStr}' to function '${intent.symbol}'`,
        params: {
          symbolName: intent.symbol,
          newParam: paramStr,
          paramType: intent.param.type,
          paramDefault: defaultVal
        }
      });
      const refFiles = [...new Set(references.map((r) => r.file))];
      if (defaultVal === undefined) {
        for (const file of refFiles) {
          unresolved.push({
            file,
            operation: "insert-call-arg",
            reason: `no default given for '${intent.param.name}', so the argument to pass at each call site cannot be computed`,
            resolution: `Re-run with "param": {"name": "${intent.param.name}", "default": "<value>"}, or edit the call sites in ${shortPath(file)} yourself with \`diff apply\`.`
          });
        }
        break;
      }
      refFiles.forEach((file, i) => {
        steps.push({
          order: i + 1,
          file,
          operation: "insert-call-arg",
          description: `Add argument '${defaultVal}' at all call sites in ${shortPath(file)}`,
          params: {
            functionName: intent.symbol,
            argValue: defaultVal
          }
        });
      });
      break;
    }
    case "remove-parameter": {
      throw new UnsupportedIntentError("remove-parameter is not implemented.");
    }
    case "rename-exported-symbol": {
      steps.push({
        order: 0,
        file: definition.file,
        operation: "rename-symbol",
        description: `Rename '${intent.symbol}' → '${intent.newName}' in definition`,
        params: { oldName: intent.symbol, newName: intent.newName }
      });
      const refFiles = [...new Set(references.map((r) => r.file))].filter((f) => f !== definition.file);
      refFiles.forEach((file, i) => {
        steps.push({
          order: i + 1,
          file,
          operation: "rename-symbol",
          description: `Rename in ${shortPath(file)}`,
          params: { oldName: intent.symbol, newName: intent.newName }
        });
      });
      break;
    }
  }
  const impactedFiles = [...new Set(steps.map((s) => s.file))];
  return {
    intent,
    definition,
    references,
    steps,
    unresolved,
    impactSummary: `${steps.length} edits across ${impactedFiles.length} files` + (references.length > 0 ? ` (${references.length} references found)` : "") + (unresolved.length > 0 ? `; ${unresolved.length} unresolved in ${new Set(unresolved.map((u) => u.file)).size} files` : "")
  };
}
function shortPath(file) {
  const idx = file.lastIndexOf("/src/");
  if (idx !== -1)
    return file.slice(idx + 1);
  const idx2 = file.lastIndexOf("/tests/");
  if (idx2 !== -1)
    return file.slice(idx2 + 1);
  return file.split("/").pop() || file;
}
// src/core/plan-executor.ts
async function executePlan(plan, options = {}) {
  const start = Date.now();
  const dryRun = options.dryRun ?? false;
  const doVerify = options.verify ?? true;
  const doRevert = options.revertOnFailure ?? true;
  const timeout = options.timeout ?? 30000;
  const unresolved = plan.unresolved ?? [];
  if (unresolved.length > 0 && !options.yes) {
    return {
      success: false,
      intent: plan.intent,
      plan,
      steps: [],
      summary: { totalSteps: plan.steps.length, succeeded: 0, failed: 0, elapsed_ms: Date.now() - start },
      reverted: false,
      errorCode: "UNSUPPORTED_OPERATION",
      unresolved
    };
  }
  const planActor = options.actor;
  const planTaskId = options.taskId;
  const planContext = options.context;
  const planReason = options.reason ?? `${plan.intent.operation} on '${plan.intent.symbol}'`;
  const changeSetId = createChangeSet();
  const stepTotal = plan.steps.length;
  const originals = new Map;
  if (doRevert) {
    for (const file of [...new Set(plan.steps.map((s) => s.file))]) {
      try {
        originals.set(file, await Bun.file(file).text());
      } catch {}
    }
  }
  const results = [];
  for (const step of plan.steps) {
    const stepStart = Date.now();
    let stepSuccess = false;
    let stepMessage = "";
    let stepNewSource;
    let stepSource;
    try {
      stepSource = await Bun.file(step.file).text();
      const source = stepSource;
      let result;
      switch (step.operation) {
        case "insert-parameter":
          result = insertParameter(source, step.file, step.params.symbolName, step.params.newParam);
          break;
        case "insert-call-arg":
          result = insertCallArg(source, step.file, step.params.functionName, step.params.argValue);
          break;
        case "rename-symbol":
          result = renameSymbol(source, step.file, step.params.oldName, step.params.newName);
          break;
        case "replace-hash": {
          const srcHash = computeHash(source);
          const hashResult = await replaceHash(step.file, srcHash, step.params.newContent, { dryRun });
          result = hashResult;
          break;
        }
        case "diff": {
          const { oldContent, newContent } = step.params;
          if (!oldContent || !newContent) {
            result = { success: false, message: "Diff requires oldContent and newContent" };
            break;
          }
          const count = source.split(oldContent).length - 1;
          if (count === 0) {
            result = { success: false, message: `Content not found in ${step.file}` };
          } else if (count > 1) {
            result = { success: false, message: `Content appears ${count} times — disambiguate` };
          } else {
            const newSource = source.split(oldContent).join(newContent);
            result = { success: true, message: `Replaced content`, newSource };
          }
          break;
        }
        default:
          result = { success: false, message: `Unknown operation: ${step.operation}` };
      }
      stepSuccess = result.success;
      stepMessage = result.message;
      stepNewSource = result.newSource;
      if (stepSuccess && stepNewSource && !dryRun) {
        await safeWrite(step.file, stepNewSource);
      }
    } catch (err) {
      stepSuccess = false;
      stepMessage = `Error: ${err.message}`;
    }
    results.push({
      step: step.order,
      file: step.file,
      operation: step.operation,
      success: stepSuccess,
      message: stepMessage,
      elapsed_ms: Date.now() - stepStart
    });
    const stepProvenance = buildProvenanceFields({
      actor: planActor,
      taskId: planTaskId,
      changeSetId,
      reason: step.description,
      source: stepSource,
      newSource: stepNewSource,
      stepIndex: step.order,
      stepTotal,
      context: planContext,
      filePath: step.file
    });
    let stepRoute = "ast";
    if (step.operation === "diff")
      stepRoute = "diff";
    else if (step.operation === "replace-hash")
      stepRoute = "hash";
    recordEvent({
      operation: step.operation,
      route: stepRoute,
      file: step.file,
      language: detectLanguage(step.file) || undefined,
      success: stepSuccess,
      elapsed_ms: Date.now() - stepStart,
      ...stepProvenance
    });
  }
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  const allPassed = failed === 0;
  let verification;
  if (doVerify && !dryRun) {
    const impactedFiles = [...new Set(plan.steps.map((s) => s.file))];
    verification = await verifyChanges(impactedFiles, {
      autoDetect: true,
      revertOnFailure: false,
      timeout
    });
  }
  let reverted = false;
  if (!allPassed && doRevert && !dryRun && originals.size > 0) {
    for (const [file, original] of originals) {
      try {
        await safeWrite(file, original);
      } catch {}
    }
    reverted = true;
  }
  const elapsed = Date.now() - start;
  recordEvent({
    operation: `intent-${plan.intent.operation}`,
    route: "intent",
    success: allPassed,
    elapsed_ms: elapsed,
    files_count: plan.steps.length,
    changeSetId,
    actor: planActor,
    taskId: planTaskId,
    reason: planReason,
    context: planContext,
    stepTotal: plan.steps.length
  });
  return {
    success: allPassed,
    intent: plan.intent,
    plan,
    steps: results,
    summary: {
      totalSteps: plan.steps.length,
      succeeded,
      failed,
      elapsed_ms: elapsed
    },
    verification,
    reverted,
    unresolved
  };
}
async function executeIntent(rawIntent, options = {}) {
  const intent = parseIntent(rawIntent);
  const projectRoot = options.projectRoot || ".";
  const definition = await findSymbolDefinition(intent.symbol, projectRoot, intent.file);
  if (!definition) {
    throw new Error(`Symbol '${intent.symbol}' not found in project at ${projectRoot}`);
  }
  const references = await findReferences(intent.symbol, projectRoot, definition.file);
  const plan = generatePlan(intent, definition, references);
  const execution = await executePlan(plan, options);
  return { success: execution.success, plan, execution, errorCode: execution.errorCode };
}
// src/core/doctor.ts
import { existsSync as existsSync5, readFileSync as readFileSync4, mkdirSync as mkdirSync3, writeFileSync as writeFileSync4, rmSync } from "fs";
import { join as join5 } from "path";
var HOME = process.env.HOME || "/root";
var AGENTIC_TOOLS = join5(HOME, ".agentic-tools");
var CORE_DIR = join5(AGENTIC_TOOLS, "structured-editing");
var BIN_DIR = join5(AGENTIC_TOOLS, "bin");
var CLI_LAUNCHER = join5(BIN_DIR, "structured-edit");
var LOG_DIR2 = join5(AGENTIC_TOOLS, "logs");
var MANIFEST = join5(AGENTIC_TOOLS, "manifest.json");
var CONFIG_DIR = join5(HOME, ".config", "hashpilot");
var CONFIG_FILE = join5(CONFIG_DIR, "config.json");
var CLAUDE_FILE = join5(HOME, ".claude", "CLAUDE.md");
var OPENCODE_SKILL = join5(HOME, ".config", "opencode", "skills", "hashpilot", "SKILL.md");
var OPENCODE_AGENT = join5(HOME, ".config", "opencode", "agent", "hashpilot.md");
var PI_EXTENSION = join5(HOME, ".pi", "agent", "extensions", "hashpilot.ts");
var PI_SKILL = join5(HOME, ".pi", "agent", "skills", "hashpilot", "SKILL.md");
var HASH_VERSION = "0.1.0";
var CLAUDE_MARKER = "HashPilot Claude — Structured Editing Integration";
function checkFile(path2, label) {
  if (existsSync5(path2)) {
    return { name: label, status: "pass", message: `Found: ${path2}` };
  }
  return { name: label, status: "fail", message: `Missing: ${path2}` };
}
function checkDir(path2, label) {
  if (existsSync5(path2)) {
    return { name: label, status: "pass", message: `Found: ${path2}` };
  }
  return { name: label, status: "fail", message: `Missing: ${path2}` };
}
function checkWritable(path2, label) {
  try {
    if (!existsSync5(path2)) {
      mkdirSync3(path2, { recursive: true });
    }
    const testFile = join5(path2, `.doctor-write-test-${Date.now()}`);
    writeFileSync4(testFile, "");
    try {
      rmSync(testFile);
    } catch {}
    return { name: label, status: "pass", message: `Writable: ${path2}` };
  } catch {
    return { name: label, status: "fail", message: `Not writable: ${path2}` };
  }
}
function doctor() {
  const checks = [];
  const timestamp = new Date().toISOString();
  checks.push(checkDir(CORE_DIR, "core-directory"));
  checks.push(checkFile(join5(CORE_DIR, "src", "cli.ts"), "core-cli.ts"));
  checks.push(checkFile(join5(CORE_DIR, "package.json"), "core-package.json"));
  checks.push(checkFile(CLI_LAUNCHER, "cli-launcher"));
  checks.push(checkCLIExecutable());
  checks.push(...checkConfig());
  checks.push(checkClaudeIntegration());
  checks.push(checkFile(OPENCODE_SKILL, "opencode-skill"));
  checks.push(checkFile(OPENCODE_AGENT, "opencode-agent"));
  checks.push(checkFile(PI_EXTENSION, "pi-extension"));
  checks.push(checkFile(PI_SKILL, "pi-skill"));
  checks.push(checkWritable(LOG_DIR2, "telemetry-writable"));
  checks.push(checkFile(MANIFEST, "manifest"));
  const healthy = checks.every((c) => c.status === "pass");
  return { checks, healthy, timestamp, version: HASH_VERSION };
}
function checkCLIExecutable() {
  try {
    const proc2 = Bun.spawnSync(["structured-edit", "--version"], {
      env: { ...process.env, PATH: `${BIN_DIR}:${process.env.PATH || ""}` }
    });
    if (proc2.exitCode === 0) {
      return { name: "cli-executable", status: "pass", message: `CLI works: ${proc2.stdout.toString().trim()}` };
    }
    return { name: "cli-executable", status: "fail", message: `CLI exited with code ${proc2.exitCode}: ${proc2.stderr.toString().trim()}` };
  } catch (e) {
    return { name: "cli-executable", status: "fail", message: `Cannot run CLI: ${e.message}` };
  }
}
function checkConfig() {
  const results = [];
  const cfgExists = existsSync5(CONFIG_FILE);
  if (cfgExists) {
    results.push(checkFile(CONFIG_FILE, "config-file"));
    try {
      const cfg = JSON.parse(readFileSync4(CONFIG_FILE, "utf-8"));
      results.push({ name: "config-parseable", status: "pass", message: "Config is valid JSON" });
      if (cfg.telemetry && typeof cfg.telemetry.enabled !== "boolean") {
        results.push({ name: "config-telemetry-type", status: "warn", message: "telemetry.enabled should be boolean" });
      }
      if (cfg.routePolicy) {
        results.push({ name: "config-has-policy", status: "pass", message: "Route policy configured" });
      }
    } catch {
      results.push({ name: "config-parseable", status: "fail", message: "Config is not valid JSON" });
    }
  } else {
    results.push({ name: "config-file", status: "skip", message: "No config file — using defaults" });
  }
  try {
    const cfg = loadConfig();
    results.push({ name: "config-loadable", status: "pass", message: "Config defaults load correctly" });
  } catch {
    results.push({ name: "config-loadable", status: "fail", message: "Cannot load config" });
  }
  return results;
}
function checkClaudeIntegration() {
  if (!existsSync5(CLAUDE_FILE)) {
    return { name: "claude-integration", status: "skip", message: "Claude CLAUDE.md not found — not installed" };
  }
  try {
    const content = readFileSync4(CLAUDE_FILE, "utf-8");
    if (content.includes(CLAUDE_MARKER)) {
      return { name: "claude-integration", status: "pass", message: "HashPilot section found in CLAUDE.md" };
    }
    return { name: "claude-integration", status: "warn", message: "CLAUDE.md exists but HashPilot section missing" };
  } catch {
    return { name: "claude-integration", status: "fail", message: "Cannot read CLAUDE.md" };
  }
}
// src/cli.ts
var VERSION = package_default.version;
var program2 = new Command;
function parseRange(raw) {
  const match2 = /^(\d+)(?::(\d+))?$/.exec(raw.trim());
  if (!match2) {
    return { error: `Invalid --range "${raw}": expected N or N:M with positive integers.` };
  }
  const start = Number(match2[1]);
  const end = match2[2] === undefined ? start : Number(match2[2]);
  if (start < 1)
    return { error: `Invalid --range "${raw}": line numbers are 1-indexed.` };
  if (start > end)
    return { error: `Invalid --range "${raw}": start is after end.` };
  return { range: { start, end } };
}
function parseIntFlag(raw, name, fallback) {
  if (raw === undefined)
    return fallback;
  if (!/^\d+$/.test(String(raw).trim())) {
    return { error: `Invalid ${name} "${raw}": expected a non-negative integer.` };
  }
  return Number(raw);
}
program2.name("structured-edit").description("HashPilot \u2014 Structured Editing Core for Coding Agents").version(VERSION).option("--allow-outside-root", "Permit writes outside the project root (credentials and system paths stay blocked)").option("--allowed-root <dir...>", "Additional directory writes may target").option("--no-telemetry", "Disable telemetry logging for this invocation").option("--allow-parse-errors", "Edit a file that already has syntax errors (the post-edit parse check still applies)").hook("preAction", (thisCommand, actionCommand) => {
  const path2 = [];
  for (let c = actionCommand;c && c.parent; c = c.parent)
    path2.unshift(c.name());
  setCommand(path2.join(" "));
  const globals = thisCommand.opts();
  const config = loadConfig();
  configureWriteBoundary({
    allowOutsideRoot: Boolean(globals.allowOutsideRoot),
    allowedRoots: [...config.allowedRoots || [], ...globals.allowedRoot || []]
  });
  configureTelemetry(config.telemetry);
  enableTelemetry(resolveTelemetryEnabled(config.telemetry, globals.telemetry === false));
  setAllowParseErrors(Boolean(globals.allowParseErrors));
  configureSnapshots(config.snapshots);
  setCurrentChangeSet(config.snapshots?.enabled === false ? null : createChangeSet());
  pruneSnapshots();
});
program2.command("read-many").description("Read multiple files, return content + hashes").argument("<files...>", "File paths").option("--json", "Output as JSON", true).action(async (files, opts) => {
  const start = Date.now();
  const results = await readMany(files);
  recordEvent({
    operation: "read-many",
    route: "read",
    files_count: files.length,
    success: !results.some((r) => r.error),
    elapsed_ms: Date.now() - start
  });
  finish(results);
});
program2.command("read-hash").description("Read a line with hash and context").argument("<file>", "File path").argument("<line>", "Line number", parseInt).option("-c, --context <n>", "Context lines", "3").option("--json", "Output as JSON", true).action(async (file, line, opts) => {
  const start = Date.now();
  const context = parseIntFlag(opts.context, "--context", 3);
  if (typeof context === "object")
    return usageError(context.error, { path: file });
  const result = await readHash(file, line, context);
  recordEvent({
    operation: "read-hash",
    route: "hash",
    file,
    success: !result.error,
    lines_read: 1 + (result.contextBefore?.length || 0) + (result.contextAfter?.length || 0),
    elapsed_ms: Date.now() - start
  });
  finish(result);
});
program2.command("grep-many").description("Search pattern across multiple paths").argument("<pattern>", "Regex pattern").argument("<paths...>", "Paths to search").option("-i, --ignore-case", "Case insensitive").option("--file-pattern <glob>", "File pattern filter").option("--max-results <n>", "Max results", parseInt).option("--json", "Output as JSON", true).action(async (pattern, paths, opts) => {
  const result = await grepMany(pattern, paths, {
    ignoreCase: opts.ignoreCase,
    filePattern: opts.filePattern,
    maxResults: opts.maxResults
  });
  recordEvent({
    operation: "grep-many",
    route: "grep",
    files_count: paths.length,
    success: !result.error,
    elapsed_ms: result.elapsed_ms
  });
  finish(result);
});
program2.command("symbol-lookup-many").description("Find symbol definitions. Usage: symbol-lookup-many <paths...> --names n1,n2").argument("<paths...>", "Paths to search").option("--names <names>", "Comma-separated symbol names").option("--json", "Output as JSON", true).action(async (paths, opts) => {
  const names = (opts.names || "").split(",").filter(Boolean);
  const results = await symbolLookupMany(names, paths);
  finish(results);
});
program2.command("replace-hash").description("Replace content identified by hash anchor").argument("<file>", "File path").argument("<old-hash>", "Hash of content to replace").argument("<new-content>", "New content (or @file to read from file)").option("--range <start:end>", "Line range (1-indexed). N or N:M").option("--no-recover", "Fail immediately on a stale anchor instead of attempting relocation").option("--dry-run", "Preview without writing").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, oldHash, newContent, opts) => {
  let content = newContent;
  if (newContent.startsWith("@")) {
    content = await Bun.file(newContent.slice(1)).text();
  }
  let range;
  if (opts.range) {
    const parsed = parseRange(opts.range);
    if ("error" in parsed)
      return usageError(parsed.error, { path: file });
    range = parsed.range;
  }
  const result = await replaceHash(file, oldHash, content, {
    range,
    dryRun: opts.dryRun,
    recovery: opts.recover === false ? "off" : "relocate",
    skipParseCheck: Boolean(program2.opts().allowParseErrors)
  });
  const provFields = buildProvenanceFields({
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason,
    filePath: file
  });
  recordEvent({
    operation: "replace-hash",
    route: "hash",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    fallback_reason: result.stale ? "stale-anchor" : undefined,
    retries: result.retries ?? 0,
    elapsed_ms: 0,
    ...provFields
  });
  finish(result);
});
var astCmd = program2.command("ast").description("Syntax-aware editing via tree-sitter");
astCmd.command("capabilities").description("Show supported AST languages, operations, and limitations").action(() => {
  finish(astCapabilities());
});
astCmd.command("find-symbols").description("List symbols in a file").argument("<file>", "File path").action(async (file) => {
  const content = await Bun.file(file).text();
  const symbols = findSymbols(content, file);
  finish(symbols);
});
function recordProvenanceEvent(opts) {
  const provFields = buildProvenanceFields({
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason,
    source: opts.source,
    newSource: opts.newSource,
    filePath: opts.filePath
  });
  recordEvent({
    operation: opts.operation,
    route: opts.route,
    file: opts.file,
    language: opts.language,
    success: opts.success,
    elapsed_ms: opts.elapsed_ms,
    errorCode: opts.errorCode,
    ...provFields
  });
}
astCmd.command("rename-symbol").description("Rename a symbol across a file").argument("<file>", "File path").argument("<old-name>", "Current symbol name").argument("<new-name>", "New symbol name").option("--dry-run", "Preview only").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, oldName, newName, opts) => {
  const start = Date.now();
  const content = await Bun.file(file).text();
  const result = renameSymbol(content, file, oldName, newName);
  if (result.success && result.newSource && !opts.dryRun) {
    await safeWrite(file, result.newSource);
  }
  recordProvenanceEvent({
    operation: "rename-symbol",
    route: "ast",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    elapsed_ms: Date.now() - start,
    errorCode: result.success ? undefined : "PARSE_ERROR" /* PARSE_ERROR */,
    source: content,
    newSource: result.newSource,
    filePath: file,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  });
  finish(result);
});
astCmd.command("replace-body").description("Replace function/method body").argument("<file>", "File path").argument("<symbol>", "Symbol name").argument("<new-body>", "New body (or @file)").option("--dry-run", "Preview only").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, symbol, newBody, opts) => {
  const start = Date.now();
  let body = newBody;
  if (newBody.startsWith("@"))
    body = await Bun.file(newBody.slice(1)).text();
  const content = await Bun.file(file).text();
  const result = replaceBody(content, file, symbol, body);
  if (result.success && result.newSource && !opts.dryRun) {
    await safeWrite(file, result.newSource);
  }
  recordProvenanceEvent({
    operation: "replace-body",
    route: "ast",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    elapsed_ms: Date.now() - start,
    errorCode: result.success ? undefined : "PARSE_ERROR" /* PARSE_ERROR */,
    source: content,
    newSource: result.newSource,
    filePath: file,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  });
  finish(result);
});
astCmd.command("add-import").description("Add an import statement").argument("<file>", "File path").argument("<import-spec>", "Import spec (e.g. '{ Foo } from ./bar')").option("--dry-run", "Preview only").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, importSpec, opts) => {
  const start = Date.now();
  const content = await Bun.file(file).text();
  const result = addImport(content, file, importSpec);
  if (result.success && result.newSource && !opts.dryRun) {
    await safeWrite(file, result.newSource);
  }
  recordProvenanceEvent({
    operation: "add-import",
    route: "ast",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    elapsed_ms: Date.now() - start,
    errorCode: result.success ? undefined : "PARSE_ERROR" /* PARSE_ERROR */,
    source: content,
    newSource: result.newSource,
    filePath: file,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  });
  finish(result);
});
astCmd.command("remove-import").description("Remove an import statement").argument("<file>", "File path").argument("<import-spec>", "Import spec to remove").option("--dry-run", "Preview only").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, importSpec, opts) => {
  const start = Date.now();
  const content = await Bun.file(file).text();
  const result = removeImport(content, file, importSpec);
  if (result.success && result.newSource && !opts.dryRun) {
    await safeWrite(file, result.newSource);
  }
  recordProvenanceEvent({
    operation: "remove-import",
    route: "ast",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    elapsed_ms: Date.now() - start,
    errorCode: result.success ? undefined : "PARSE_ERROR" /* PARSE_ERROR */,
    source: content,
    newSource: result.newSource,
    filePath: file,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  });
  finish(result);
});
astCmd.command("insert-before").description("Insert content before a symbol").argument("<file>", "File path").argument("<symbol>", "Symbol name").argument("<content>", "Content to insert (or @file)").option("--dry-run", "Preview only").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, symbol, content, opts) => {
  const start = Date.now();
  let c = content;
  if (c.startsWith("@"))
    c = await Bun.file(c.slice(1)).text();
  const src = await Bun.file(file).text();
  const result = insertBeforeSymbol(src, file, symbol, c);
  if (result.success && result.newSource && !opts.dryRun) {
    await safeWrite(file, result.newSource);
  }
  recordProvenanceEvent({
    operation: "insert-before",
    route: "ast",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    elapsed_ms: Date.now() - start,
    errorCode: result.success ? undefined : "PARSE_ERROR" /* PARSE_ERROR */,
    source: src,
    newSource: result.newSource,
    filePath: file,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  });
  finish(result);
});
astCmd.command("insert-after").description("Insert content after a symbol").argument("<file>", "File path").argument("<symbol>", "Symbol name").argument("<content>", "Content to insert (or @file)").option("--dry-run", "Preview only").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, symbol, content, opts) => {
  const start = Date.now();
  let c = content;
  if (c.startsWith("@"))
    c = await Bun.file(c.slice(1)).text();
  const src = await Bun.file(file).text();
  const result = insertAfterSymbol(src, file, symbol, c);
  if (result.success && result.newSource && !opts.dryRun) {
    await safeWrite(file, result.newSource);
  }
  recordProvenanceEvent({
    operation: "insert-after",
    route: "ast",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    elapsed_ms: Date.now() - start,
    errorCode: result.success ? undefined : "PARSE_ERROR" /* PARSE_ERROR */,
    source: src,
    newSource: result.newSource,
    filePath: file,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  });
  finish(result);
});
program2.command("route-edit").description("Auto-routed structured edit through AST \u2192 Hash \u2192 Diff pipeline").argument("<file>", "File path").argument("<operation>", "Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content)").option("--method <route>", "Force a specific route (ast, hash, diff)").option("--old-hash <hash>", "Hash for hash-route verification").option("--new-content <text>", "New content (or @file)").option("--old-content <text>", "Old content for diff-route search-and-replace").option("--range <start:end>", "Line range for hash route").option("--old-name <name>", "Old symbol name (rename-symbol)").option("--new-name <name>", "New symbol name (rename-symbol)").option("--symbol <name>", "Symbol name (replace-body, insert-before, insert-after)").option("--new-body <text>", "New body content (replace-body, or @file)").option("--import-spec <spec>", "Import spec (add-import, remove-import)").option("--content <text>", "Content (insert-before, insert-after, or @file)").option("--policy <json>", "Inline RoutePolicy JSON").option("--dry-run", "Preview without writing").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, operation, opts) => {
  const resolveContent = async (val) => {
    if (!val)
      return;
    if (val.startsWith("@"))
      return await Bun.file(val.slice(1)).text();
    return val;
  };
  const result = await routeEdit({
    filePath: file,
    operation,
    method: opts.method,
    oldHash: opts.oldHash,
    newContent: await resolveContent(opts.newContent),
    oldContent: opts.oldContent,
    range: opts.range ? (([s, e]) => ({ start: s, end: e }))(opts.range.split(":").map(Number)) : undefined,
    oldName: opts.oldName,
    newName: opts.newName,
    symbolName: opts.symbol,
    newBody: await resolveContent(opts.newBody),
    importSpec: opts.importSpec,
    content: await resolveContent(opts.content),
    policy: opts.policy ? JSON.parse(opts.policy) : undefined,
    dryRun: opts.dryRun,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  });
  finish(result);
});
program2.command("batch").description("Apply the same edit to multiple files in parallel").argument("<operation>", "Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content)").argument("<files...>", "Files to edit").option("--method <route>", "Force a specific route (ast, hash, diff)").option("--old-hash <hash>", "Hash for hash-route verification").option("--new-content <text>", "New content (or @file)").option("--old-content <text>", "Old content for diff-route search-and-replace").option("--range <start:end>", "Line range for hash route").option("--old-name <name>", "Old symbol name (rename-symbol)").option("--new-name <name>", "New symbol name (rename-symbol)").option("--symbol <name>", "Symbol name (replace-body, insert-before, insert-after)").option("--new-body <text>", "New body content (replace-body, or @file)").option("--import-spec <spec>", "Import spec (add-import, remove-import)").option("--content <text>", "Content (insert-before, insert-after, or @file)").option("--policy <json>", "Inline RoutePolicy JSON").option("--serial", "Execute sequentially instead of parallel").option("--dry-run", "Preview without writing").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (operation, files, opts) => {
  const resolveContent = async (val) => {
    if (!val)
      return;
    if (val.startsWith("@"))
      return await Bun.file(val.slice(1)).text();
    return val;
  };
  const batchParams = {
    files,
    operation,
    method: opts.method,
    oldHash: opts.oldHash,
    newContent: await resolveContent(opts.newContent),
    oldContent: opts.oldContent,
    range: opts.range ? (([s, e]) => ({ start: s, end: e }))(opts.range.split(":").map(Number)) : undefined,
    oldName: opts.oldName,
    newName: opts.newName,
    symbolName: opts.symbol,
    newBody: await resolveContent(opts.newBody),
    importSpec: opts.importSpec,
    content: await resolveContent(opts.content),
    policy: opts.policy ? JSON.parse(opts.policy) : undefined,
    dryRun: opts.dryRun,
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason
  };
  const result = opts.serial ? await editManySerial(batchParams) : await editMany(batchParams);
  finish(result);
});
program2.command("intent").description("Execute an editing intent \u2014 one command, full blast radius").argument("<intent>", 'Intent as JSON: {"operation":"add-parameter","symbol":"fn","param":{"name":"x"}}').option("--project-root <dir>", "Project root directory").option("--dry-run", "Preview plan without modifying files").option("--yes", "Apply the plan even though part of the intent could not be resolved").option("--no-verify", "Skip verification after execution").option("--no-revert", "Don't roll back on failure").option("--timeout <ms>", "Timeout per operation in ms", "30000").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--context <text>", "Agent prompt/context (or @file)").option("--json", "Output as JSON", true).action(async (intent, opts) => {
  try {
    let context = opts.context;
    if (context && context.startsWith("@")) {
      context = await Bun.file(context.slice(1)).text();
    }
    const result = await executeIntent(intent, {
      projectRoot: opts.projectRoot || process.cwd(),
      dryRun: opts.dryRun,
      yes: Boolean(opts.yes),
      verify: opts.verify,
      revertOnFailure: opts.revert,
      timeout: parseInt(opts.timeout),
      actor: opts.actor,
      taskId: opts.taskId,
      reason: opts.reason,
      context
    });
    if (opts.json) {
      finish(result);
    } else {
      console.log(`Intent: ${result.plan.intent.operation} on '${result.plan.definition.name}'`);
      console.log(`Impact: ${result.plan.impactSummary}`);
      for (const u of result.plan.unresolved) {
        console.log(`Unresolved (${u.file}): ${u.reason}`);
        console.log(`  \u2192 ${u.resolution}`);
      }
      console.log(`Success: ${result.success}`);
      if (result.execution.verification) {
        console.log(`Verification: ${result.execution.verification.overall}`);
      }
      process.exitCode = exitCodeFor(result);
    }
  } catch (err) {
    console.error(`Intent failed: ${err.message}`);
    process.exitCode = 1;
  }
});
var diffCmd = program2.command("diff").description("Unified diff generation and patch application");
diffCmd.command("generate").description("Generate a unified diff between old and new content").argument("<file>", "File path (for diff header)").argument("<old-content>", "Old content (or @file)").argument("<new-content>", "New content (or @file)").option("-c, --context <n>", "Context lines", "3").option("--raw", "Print the diff text alone, without the JSON envelope").action(async (file, oldContent, newContent, opts) => {
  const start = Date.now();
  let oldSrc = oldContent;
  let newSrc = newContent;
  if (oldContent.startsWith("@"))
    oldSrc = await Bun.file(oldContent.slice(1)).text();
  if (newContent.startsWith("@"))
    newSrc = await Bun.file(newContent.slice(1)).text();
  const diff = generateUnifiedDiff(oldSrc, newSrc, file, parseInt(opts.context));
  recordEvent({
    operation: "diff-generate",
    route: "diff",
    file,
    success: true,
    elapsed_ms: Date.now() - start
  });
  if (opts.raw) {
    console.log(diff || "(no changes)");
    return;
  }
  finish({ path: file, changed: diff.length > 0, diff }, 0 /* OK */);
});
diffCmd.command("apply").description("Apply a unified diff patch to a file").argument("<file>", "File to patch").option("--patch <file>", "Patch file to apply (or '-' for stdin)").option("--dry-run", "Preview without writing").option("-f, --fuzzy <n>", "Fuzzy match tolerance", "3").option("--actor <name>", "Agent identity for provenance tracking").option("--task-id <id>", "Task/issue reference for provenance").option("--reason <text>", "Human-readable reason for the edit").option("--json", "Output as JSON", true).action(async (file, opts) => {
  const start = Date.now();
  let patchText;
  if (opts.patch === "-") {
    const chunks = [];
    for await (const chunk of Bun.stdin.stream()) {
      chunks.push(Buffer.from(chunk).toString());
    }
    patchText = chunks.join("");
  } else if (opts.patch) {
    patchText = await Bun.file(opts.patch).text();
  } else {
    return usageError("--patch is required", { path: file });
  }
  const fuzzy = parseIntFlag(opts.fuzzy, "--fuzzy", 3);
  if (typeof fuzzy === "object")
    return usageError(fuzzy.error, { path: file });
  const result = await applyPatch(file, patchText, {
    dryRun: opts.dryRun,
    fuzzyMatch: fuzzy
  });
  const provFields = buildProvenanceFields({
    actor: opts.actor,
    taskId: opts.taskId,
    reason: opts.reason,
    filePath: file
  });
  recordEvent({
    operation: "diff-apply",
    route: "diff",
    file,
    language: detectLanguage(file) || undefined,
    success: result.success,
    elapsed_ms: Date.now() - start,
    ...provFields
  });
  finish(result);
});
program2.command("verify-changes").description("Run formatter, linter, typechecker, and tests on changed files").argument("<files...>", "Files to verify").option("--formatter <cmd>", "Formatter command").option("--linter <cmd>", "Linter command").option("--typecheck <cmd>", "Type checker command (e.g. 'tsc --noEmit')").option("--test-filter <pattern>", "Test filter pattern").option("--test-runner <runner>", "Test runner (bun test, vitest, jest, pytest, go test, cargo test)").option("--formatter-args <args...>", "Formatter args").option("--linter-args <args...>", "Linter args").option("--test-args <args...>", "Test runner args").option("--auto-detect", "Auto-detect tools from project config files").option("--revert-on-failure", "Restore original file contents if any check fails").option("--timeout <ms>", "Per-check timeout in ms (default 30000)", parseInt).option("--json", "Output as JSON", true).action(async (files, opts) => {
  const result = await verifyChanges(files, {
    formatter: opts.formatter,
    linter: opts.linter,
    typecheck: opts.typecheck,
    testFilter: opts.testFilter,
    testRunner: opts.testRunner,
    formatterArgs: opts.formatterArgs,
    linterArgs: opts.linterArgs,
    testArgs: opts.testArgs,
    autoDetect: opts.autoDetect,
    revertOnFailure: opts.revertOnFailure,
    timeout: opts.timeout
  });
  finish(result);
});
function warnSkipped() {
  const skipped = lastReadSkipped();
  if (skipped > 0) {
    const message = `skipped ${skipped} malformed telemetry line(s) \u2014 the log is corrupt`;
    addWarning({ code: "TELEMETRY_LOG_CORRUPT", message, skipped });
    console.error(`warning: ${message}`);
  }
}
var telCmd = program2.command("telemetry").description("View or manage telemetry");
telCmd.command("show").description("Show recent telemetry events").option("-n, --limit <n>", "Number of events", "20").action(async (opts) => {
  const limit = parseIntFlag(opts.limit, "--limit", 20);
  if (typeof limit === "object")
    return usageError(limit.error);
  const events = readEvents(limit);
  warnSkipped();
  finish(events, 0 /* OK */);
});
telCmd.command("summary").description("Show telemetry summary").action(() => {
  const result = summary();
  warnSkipped();
  finish(result, 0 /* OK */);
});
telCmd.command("health").description("Show telemetry health report with per-language stats and threshold warnings").option("-w, --window <days>", "Time window in days", "7").option("-t, --trend", "Compare current window to previous window").action((opts) => {
  const window2 = parseIntFlag(opts.window, "--window", 7);
  if (typeof window2 === "object")
    return usageError(window2.error);
  const report = opts.trend ? healthTrend(window2) : health(window2);
  warnSkipped();
  finish(report, 0 /* OK */);
});
telCmd.command("clear").description("Clear telemetry log").action(() => {
  clearEvents();
  finish({ success: true, message: "Telemetry cleared." }, 0 /* OK */);
});
telCmd.command("sessions").description("List session summaries").action(() => {
  const sessions = listSessions();
  warnSkipped();
  finish(sessions, 0 /* OK */);
});
telCmd.command("export").description("Export telemetry events as NDJSON").option("--from <date>", "Start date (ISO format)").option("--to <date>", "End date (ISO format)").option("--session <id>", "Session ID filter").option("--ndjson", "Stream one compact event per line instead of the JSON envelope").action((opts) => {
  const events = exportEvents({
    from: opts.from ? new Date(opts.from) : undefined,
    to: opts.to ? new Date(opts.to) : undefined,
    sessionId: opts.session
  });
  warnSkipped();
  if (opts.ndjson) {
    for (const e of events)
      console.log(JSON.stringify(e));
    return;
  }
  finish(events, 0 /* OK */);
});
telCmd.command("prune").description("Delete old rotated telemetry files").option("-d, --older-than <days>", "Days threshold", "30").action((opts) => {
  const deleted = pruneEvents(parseInt(opts.olderThan));
  finish({ success: true, deleted, message: `Pruned ${deleted} telemetry file(s).` }, 0 /* OK */);
});
var provCmd = program2.command("provenance").description("Query edit provenance \u2014 who changed what, when, and why");
provCmd.command("query").description("Show edit history for a file (like git blame for agent edits)").argument("<file>", "File path").argument("[line]", "Optional line number to filter by").option("--human", "Human-readable output").option("--json", "JSON output (default)", true).option("--fuzzy", "Include edits without diff data in line-filtered queries").option("--limit <n>", "Max entries to show").action((file, line, opts) => {
  const lineNum = line ? parseInt(line) : undefined;
  let results = provenanceQuery(file, lineNum, !!opts.fuzzy);
  if (opts.limit)
    results = results.slice(0, parseInt(opts.limit));
  if (opts.human) {
    console.log(formatProvenanceHuman(results));
    return;
  }
  finish(results, 0 /* OK */);
});
provCmd.command("changeset").description("Show all edits in a changeSet").argument("<changeSetId>", "ChangeSet UUID").option("--human", "Human-readable output").action((changeSetId, opts) => {
  const result = changeSetQuery(changeSetId);
  if (!result) {
    return finish({
      success: false,
      errorCode: "FILE_NOT_FOUND" /* FILE_NOT_FOUND */,
      changeSetId,
      message: `No edits found for changeSet: ${changeSetId}`,
      recovery: "structured-edit telemetry sessions"
    }, 1 /* USAGE */);
  }
  if (opts.human) {
    console.log(`ChangeSet: ${result.changeSetId}`);
    console.log(`Actor: ${result.actor}`);
    console.log(`Task: ${result.taskId ?? "N/A"}`);
    console.log(`Reason: ${result.reason}`);
    console.log(`Edits: ${result.editCount}`);
    console.log(`Time: ${result.timeRange.first} -- ${result.timeRange.last}
`);
    console.log(formatProvenanceHuman(result.entries));
    process.exitCode = exitCodeFor(result);
  } else {
    finish(result);
  }
});
program2.command("changesets").description("List undoable changeSets, newest first").option("--limit <n>", "Max changeSets to list (default 20)").action((opts) => {
  const limit = parseIntFlag(opts.limit, "--limit", 20);
  if (typeof limit === "object")
    return usageError(limit.error);
  finish({ changeSets: listChangeSets(limit) }, 0 /* OK */);
});
program2.command("undo").description("Restore every file in a changeSet to its pre-edit contents").argument("[changeSetId]", "ChangeSet to undo; omit with --last").option("--last", "Undo the most recent changeSet").option("--force", "Restore even files modified since the edit was applied").option("--dry-run", "Report what would be restored without touching the disk").action((changeSetId, opts) => {
  const id2 = opts.last ? lastChangeSetId() : changeSetId;
  if (!id2) {
    return usageError(opts.last ? "No changeSets have been recorded yet." : "Provide a changeSet ID, or pass --last.", { recovery: "structured-edit changesets" });
  }
  setCurrentChangeSet(null);
  const result = undoChangeSet(id2, { force: Boolean(opts.force), dryRun: Boolean(opts.dryRun) });
  finish(result, result.success ? 0 /* OK */ : 3 /* PRECONDITION */);
});
program2.command("doctor").description("Verify HashPilot installation health").action(() => {
  const report = doctor();
  const summaryParts = [];
  const pass = report.checks.filter((c) => c.status === "pass").length;
  const fail = report.checks.filter((c) => c.status === "fail").length;
  const warn = report.checks.filter((c) => c.status === "warn").length;
  const skip = report.checks.filter((c) => c.status === "skip").length;
  summaryParts.push(`HashPilot Doctor \u2014 ${report.healthy ? "HEALTHY" : "ISSUES FOUND"}`);
  summaryParts.push(`  Pass: ${pass}  Fail: ${fail}  Warn: ${warn}  Skip: ${skip}`);
  for (const check of report.checks) {
    const icon = check.status === "pass" ? "\u2713" : check.status === "fail" ? "\u2717" : check.status === "warn" ? "!" : "\xB7";
    summaryParts.push(`  ${icon} ${check.name}: ${check.message}`);
  }
  finish(report);
  console.error(summaryParts.join(`
`));
});
program2.command("route").description("Show which edit route would be chosen (with detailed explanation)").argument("<file>", "File path").argument("<operation>", "Operation name").option("--policy <json>", "Inline policy JSON to test").option("--no-default-config", "Ignore config file policies").action((file, operation, opts) => {
  const lang = detectLanguage(file);
  let policy = opts.policy ? JSON.parse(opts.policy) : undefined;
  if (!policy && !opts.defaultConfig) {
    policy = loadConfig().routePolicy;
  }
  const { route, explanation } = chooseRoute(file, operation, policy);
  finish({
    file,
    operation,
    language: lang,
    route,
    explanation
  });
});
program2.command("config").description("Show current HashPilot configuration").option("--config <path>", "Config file path override").action((opts) => {
  const config = loadConfig(opts.config);
  finish(config);
});
var IO_SYSCALL_CODES = new Set([
  "ENOENT",
  "EACCES",
  "EPERM",
  "EISDIR",
  "ENOTDIR",
  "ENOSPC",
  "EROFS",
  "EMFILE",
  "ENFILE",
  "EBUSY"
]);
function reportInternalError(err) {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof TelemetryReadError) {
    finish({
      success: false,
      errorCode: "READ_FAILED" /* READ_FAILED */,
      path: err.file,
      message,
      recovery: "Check that the telemetry log is readable, or run `structured-edit telemetry clear`."
    }, 5 /* IO */);
    return;
  }
  if (err instanceof PathDeniedError) {
    finish({ success: false, errorCode: err.errorCode, path: err.path, message }, 1 /* USAGE */);
    return;
  }
  const syscall = err?.code;
  if (syscall !== undefined && IO_SYSCALL_CODES.has(syscall)) {
    finish({
      success: false,
      errorCode: syscall === "ENOENT" ? "FILE_NOT_FOUND" /* FILE_NOT_FOUND */ : "WRITE_FAILED" /* WRITE_FAILED */,
      message,
      recovery: "Check that the path exists and is readable and writable."
    }, 5 /* IO */);
    return;
  }
  finish({
    success: false,
    errorCode: "INTERNAL_ERROR",
    message,
    detail: err instanceof Error ? err.stack : undefined,
    recovery: "This is a bug in HashPilot. Please report it with the command that triggered it."
  }, 70 /* INTERNAL */);
}
process.on("uncaughtException", reportInternalError);
process.on("unhandledRejection", reportInternalError);
try {
  program2.parse();
} catch (err) {
  reportInternalError(err);
}
