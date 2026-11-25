/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `quick-calculate` command */
  export type QuickCalculate = ExtensionPreferences & {}
  /** Preferences accessible in the `worksheets` command */
  export type Worksheets = ExtensionPreferences & {}
  /** Preferences accessible in the `new-worksheet` command */
  export type NewWorksheet = ExtensionPreferences & {}
  /** Preferences accessible in the `open-numi-file` command */
  export type OpenNumiFile = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `quick-calculate` command */
  export type QuickCalculate = {}
  /** Arguments passed to the `worksheets` command */
  export type Worksheets = {}
  /** Arguments passed to the `new-worksheet` command */
  export type NewWorksheet = {}
  /** Arguments passed to the `open-numi-file` command */
  export type OpenNumiFile = {}
}

