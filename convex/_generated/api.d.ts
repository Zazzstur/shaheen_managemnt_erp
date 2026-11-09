/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as catalog from "../catalog.js";
import type * as classes from "../classes.js";
import type * as classwork from "../classwork.js";
import type * as dashboard from "../dashboard.js";
import type * as exams from "../exams.js";
import type * as expenses from "../expenses.js";
import type * as fees from "../fees.js";
import type * as freeClasses from "../freeClasses.js";
import type * as fuel from "../fuel.js";
import type * as homework from "../homework.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_classHistory from "../lib/classHistory.js";
import type * as lib_dailyWork from "../lib/dailyWork.js";
import type * as lib_feeLedger from "../lib/feeLedger.js";
import type * as lib_feeQuote from "../lib/feeQuote.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_studentName from "../lib/studentName.js";
import type * as lib_timetableAssistants from "../lib/timetableAssistants.js";
import type * as lib_validators from "../lib/validators.js";
import type * as pageStars from "../pageStars.js";
import type * as reportCards from "../reportCards.js";
import type * as staff from "../staff.js";
import type * as staffAttendance from "../staffAttendance.js";
import type * as stock from "../stock.js";
import type * as studentMoves from "../studentMoves.js";
import type * as students from "../students.js";
import type * as timetables from "../timetables.js";
import type * as transport from "../transport.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attendance: typeof attendance;
  auth: typeof auth;
  catalog: typeof catalog;
  classes: typeof classes;
  classwork: typeof classwork;
  dashboard: typeof dashboard;
  exams: typeof exams;
  expenses: typeof expenses;
  fees: typeof fees;
  freeClasses: typeof freeClasses;
  fuel: typeof fuel;
  homework: typeof homework;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/classHistory": typeof lib_classHistory;
  "lib/dailyWork": typeof lib_dailyWork;
  "lib/feeLedger": typeof lib_feeLedger;
  "lib/feeQuote": typeof lib_feeQuote;
  "lib/roles": typeof lib_roles;
  "lib/studentName": typeof lib_studentName;
  "lib/timetableAssistants": typeof lib_timetableAssistants;
  "lib/validators": typeof lib_validators;
  pageStars: typeof pageStars;
  reportCards: typeof reportCards;
  staff: typeof staff;
  staffAttendance: typeof staffAttendance;
  stock: typeof stock;
  studentMoves: typeof studentMoves;
  students: typeof students;
  timetables: typeof timetables;
  transport: typeof transport;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
