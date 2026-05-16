# LockIn

LockIn is a browser extension that gates access to distracting sites based on a daily LeetCode completion rule. It exists to enforce a hard overnight block and a solve-before-unlock policy during the day.

## Language

**Hard Lock Window**:
The time range during which all **Blocked Sites** are blocked regardless of LeetCode activity.
_Avoid_: quiet hours, bedtime mode, sleep lock

**Daily Solve Gate**:
The rule that all **Blocked Sites** stay blocked until at least one LeetCode problem has been accepted for the current browser-local day.
_Avoid_: streak, activity check, progress mode

**Accepted Solve**:
A LeetCode problem submission that LeetCode records as accepted.
_Avoid_: submission, attempt, activity

**Browser-Local Day**:
The current calendar day according to the browser's local timezone.
_Avoid_: UTC day, server day, LeetCode day

**Blocked Sites**:
The set of configured hostnames that the extension denies access to.
_Avoid_: websites, social apps, distractions

**Tracked Profile**:
The LeetCode username that the extension checks when evaluating the **Daily Solve Gate**.
_Avoid_: account, session, login

**Block Page**:
A local extension page shown when a **Blocked Site** is denied, explaining why access is blocked.
_Avoid_: error page, blank page, failed load

## Relationships

- The **Hard Lock Window** blocks all **Blocked Sites** independently of the **Daily Solve Gate**
- Outside the **Hard Lock Window**, the **Daily Solve Gate** determines whether **Blocked Sites** are blocked
- The **Daily Solve Gate** is evaluated against the **Browser-Local Day**
- The **Daily Solve Gate** is checked against the **Tracked Profile**
- An **Accepted Solve** satisfies the **Daily Solve Gate** for some day
- A repeated **Accepted Solve** on a previously solved problem still satisfies the **Daily Solve Gate** for that **Browser-Local Day**
- The **Blocked Sites** default to `twitter.com`, `x.com`, and related subdomains such as `www` and `mobile`
- A **Block Page** explains whether access is denied by the **Hard Lock Window** or the **Daily Solve Gate**

## Example dialogue

> **Dev:** "If there is an **Accepted Solve** at 10:00am, can a **Blocked Site** open at 10:01am?"
> **Domain expert:** "Yes, unless the current time is inside the **Hard Lock Window**."

## Flagged ambiguities

- "unlock" previously implied a temporary overnight exception; resolved: access to **Blocked Sites** is governed by a **Daily Solve Gate** plus a separate **Hard Lock Window**.
- "today" was ambiguous between local time and remote service time; resolved: it means the **Browser-Local Day**.
- An **Accepted Solve** during `11:00pm-11:59pm` does not carry into the next **Browser-Local Day**; resolved: the **Daily Solve Gate** resets at local midnight.
