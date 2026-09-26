/* The reconciliation rules, in one place.
 *
 * evaluate() is called twice for every action: once to decide what the UI
 * offers, and again inside the server action, under a lock, to decide whether
 * to do it. One function for both means a button can never be shown for
 * something the server will refuse, or hidden for something it would allow.
 *
 * Segregation of duties: assembler, reviewer and approver must be three
 * different people. Each step needs its own role; admins may act in any role,
 * but an admin is still one person and cannot sign two steps of the same
 * reconciliation.
 */

export type Step = "assembler" | "reviewer" | "approver";
export const STEPS: Step[] = ["assembler", "reviewer", "approver"];

export type Actor = { id: string; role: string; isReadOnly: boolean };

export type RecState = {
  assemblerId: string | null;
  reviewerId: string | null;
  approverId: string | null;
} | null;

export type Decision = { allowed: boolean; reason?: string };

const STEP_ROLE: Record<Step, string> = { assembler: "ASSEMBLER", reviewer: "REVIEWER", approver: "APPROVER" };
const isAdminRole = (r: string) => r === "ADMIN" || r === "SUPER_ADMIN";
export const holdsStepRole = (a: Actor, s: Step) => isAdminRole(a.role) || a.role === STEP_ROLE[s];

const no = (reason: string): Decision => ({ allowed: false, reason });
const yes: Decision = { allowed: true };

export type Context = {
  actor: Actor;
  rec: RecState;
  clearedNetCents: number;   // sum of cleared lines in the active period
  entityActive: boolean;
  // for reopening the last closed period
  lastClosed: string | null;
  activeHasSignatures: boolean;
  rolledItemsTouched: boolean; // a rolled-forward line has since been cleared
};

export type Decisions = {
  sign: Record<Step, Decision>;
  unsign: { assembler: Decision; reviewer: Decision };
  reject: { reviewer: Decision; approver: Decision };
  reopen: Decision;
  editLines: Decision;   // clear / un-clear
  attach: Decision;      // add or remove support
};

export function evaluate(c: Context): Decisions {
  const { actor, rec } = c;
  const a = rec?.assemblerId ?? null, r = rec?.reviewerId ?? null, p = rec?.approverId ?? null;
  const ro = actor.isReadOnly ? no("Your account is read-only.") : null;
  const signedAlready = (id: string | null) => id === actor.id;

  const signAssembler = ro
    ?? (!holdsStepRole(actor, "assembler") ? no("Only an Assembler can sign this step.")
    : a ? no("Already assembled.")
    : !c.entityActive ? no("This entity is inactive.")
    : c.clearedNetCents !== 0 ? no("Cleared items must net to $0.00.")
    : yes);

  const signReviewer = ro
    ?? (!holdsStepRole(actor, "reviewer") ? no("Only a Reviewer can sign this step.")
    : !a ? no("Waiting for assembly.")
    : r ? no("Already reviewed.")
    : signedAlready(a) ? no("You assembled this account - a different person must review it.")
    : yes);

  const signApprover = ro
    ?? (!holdsStepRole(actor, "approver") ? no("Only an Approver can sign this step.")
    : !r ? no("Waiting for review.")
    : p ? no("Already approved.")
    : signedAlready(a) || signedAlready(r) ? no("You already signed an earlier step - a different person must approve it.")
    : yes);

  // Undo is for your own signature (or an admin), and only while nothing has
  // been signed on top of it.
  const unsignAssembler = ro
    ?? (!a ? no("Not signed.")
    : r ? no("Review has already been signed on top of this.")
    : !(signedAlready(a) || isAdminRole(actor.role)) ? no("Only the person who signed, or an admin, can undo this.")
    : yes);
  const unsignReviewer = ro
    ?? (!r ? no("Not signed.")
    : p ? no("Final approval has already been signed on top of this.")
    : !(signedAlready(r) || isAdminRole(actor.role)) ? no("Only the person who signed, or an admin, can undo this.")
    : yes);

  // Rejection is a decision by the next person in line, so it follows the same
  // role and independence rules as signing that step.
  const rejectReviewer = signReviewer.allowed ? yes : ro ?? (!a || r ? no("Nothing to reject at this step.") : signReviewer);
  const rejectApprover = signApprover.allowed ? yes : ro ?? (!r || p ? no("Nothing to reject at this step.") : signApprover);

  const reopen = !isAdminRole(actor.role) ? no("Only an admin can reopen an approved period.")
    : actor.isReadOnly ? no("Your account is read-only.")
    : !c.lastClosed ? no("No approved period to reopen.")
    : c.activeHasSignatures ? no("The following period has already been signed. Undo those signatures first.")
    : c.rolledItemsTouched ? no("Items that rolled forward have since been cleared. Un-clear them first.")
    : yes;

  const preparer = isAdminRole(actor.role) || actor.role === "ASSEMBLER";
  // Clearing changes what the assembler certified nets to zero, so it locks
  // the moment assembly is signed.
  const editLines = ro ?? (!preparer ? no("Only Assemblers can clear items.")
    : a ? no("Locked after assembly sign-off. Undo the assembly to make changes.")
    : yes);
  // Support can still be added after assembly (a reviewer may ask for it),
  // but not once the reviewer has signed.
  const attach = ro ?? (!preparer ? no("Only Assemblers can attach support.")
    : r ? no("Locked after review sign-off.")
    : yes);

  return {
    sign: { assembler: signAssembler, reviewer: signReviewer, approver: signApprover },
    unsign: { assembler: unsignAssembler, reviewer: unsignReviewer },
    reject: { reviewer: rejectReviewer, approver: rejectApprover },
    reopen,
    editLines,
    attach,
  };
}
