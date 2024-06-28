import { RuntimeSystem, RuntimeSubsystem, RuntimeLink } from "./runtime.js";
import { SystemMargin } from "./consts.js";
import { Link, FlowStep } from "./specification.js";
import { computeSystemSize, initSystem } from "./system.js";

/*
 * Insert a subsystem in the given parent system.
 * The resulting system is not validated and may be invalid.
 */
export function addSubsystem(
  parent: RuntimeSystem | RuntimeSubsystem,
  x: number,
  y: number,
): void {
  const newSpecSystem = {
    id: (Math.random() + 1).toString(36).substring(7),
    position: { x, y },
  };

  parent.specification.systems ??= [];
  parent.specification.systems.push(newSpecSystem);

  let rootSystem: RuntimeSystem = parent as RuntimeSystem;

  while (rootSystem.parent) {
    rootSystem = rootSystem.parent;
  }

  const newRuntimeSystem = structuredClone(newSpecSystem) as RuntimeSubsystem;

  parent.systems.push(newRuntimeSystem);

  initSystem(
    newRuntimeSystem,
    rootSystem,
    newSpecSystem,
    parent.systems.length - 1,
    parent.depth + 1,
  );

  computeSystemSize(newRuntimeSystem, rootSystem.links);
  moveSystem(newRuntimeSystem, 0, 0);
}

/*
 * Remove a subsystem in the given parent system.
 * The resulting system is not validated and may be invalid.
 */
export function removeSubsystem(subsystem: RuntimeSubsystem): void {
  subsystem.parent!.specification.systems?.splice(subsystem.index, 1);

  let rootSystem: RuntimeSystem = subsystem.parent as RuntimeSystem;

  while (rootSystem.parent) {
    rootSystem = rootSystem.parent;
  }

  // Remove links.
  let linkReadIndex = 0;
  let linkWriteIndex = 0;

  while (linkReadIndex < rootSystem.links.length) {
    const link = rootSystem.specification.links![linkReadIndex]!;

    if (
      !link.a.startsWith(subsystem.canonicalId) &&
      !link.b.startsWith(subsystem.canonicalId)
    ) {
      rootSystem.specification.links![linkWriteIndex] = link;

      linkWriteIndex++;
    }

    linkReadIndex++;
  }

  rootSystem.links.length = linkWriteIndex;

  if (rootSystem.specification.links) {
    rootSystem.specification.links.length = linkWriteIndex;
  }

  // Remove flows.
  // TODO: instead of removing the entire flow, try to remove steps.
  let flowReadIndex = 0;
  let flowWriteIndex = 0;

  while (flowReadIndex < rootSystem.flows.length) {
    const flow = rootSystem.specification.flows![flowReadIndex]!;

    if (
      !flow.steps.some(
        (step: FlowStep) =>
          step.from.startsWith(subsystem.canonicalId) ||
          step.to.startsWith(subsystem.canonicalId),
      )
    ) {
      rootSystem.specification.flows![flowWriteIndex] = flow;

      flowWriteIndex++;
    }

    flowReadIndex++;
  }

  rootSystem.flows.length = flowWriteIndex;

  if (rootSystem.specification.flows) {
    rootSystem.specification.flows.length = flowWriteIndex;
  }
}

/*
 * Add a link in the given system.
 * The resulting system is not validated and may be invalid.
 */
export function addLink(
  system: RuntimeSystem,
  aCanonicalId: string,
  bCanonicalId: string,
): Link {
  const newLink = {
    a: aCanonicalId,
    b: bCanonicalId,
  };

  system.specification.links ??= [];
  system.specification.links.push(structuredClone(newLink));

  return newLink;
}

/*
 * Remove a link in the given system.
 * The resulting system is not validated and may be invalid.
 */
export function removeLink(system: RuntimeSystem, link: RuntimeLink): void {
  system.specification.links!.splice(link.index, 1);
}

export function moveSystem(
  system: RuntimeSubsystem,
  deltaX: number,
  deltaY: number,
): void {
  // Move the ss.
  const ssPosition = system.specification.position;

  ssPosition.x += deltaX;
  ssPosition.y += deltaY;

  const centerSS = {
    x: ssPosition.x + system.size.width / 2,
    y: ssPosition.y + system.size.height / 2,
  };

  // Retrieve sibling subsystems and
  // sort them by distance of ss, nearest first.
  const subsystems = system.parent?.systems ?? [];

  // Resolve collisions.

  let iterations = 0;
  const displacedThisIteration: string[] = [];

  do {
    displacedThisIteration.length = 0;
    iterations += 1;

    for (const ssACandidate of subsystems) {
      for (const ssBCandidate of subsystems) {
        if (
          displacedThisIteration.includes(
            [ssACandidate.canonicalId, ssBCandidate.canonicalId].join("."),
          ) ||
          ssACandidate.canonicalId === ssBCandidate.canonicalId
        ) {
          continue;
        }

        // Find which subsystem displaces and
        // which subsystem is being displaced.
        //
        // It is important that the order is consistent between iterations.
        // So if subsystem A displaces subsystem B on iteration 0,
        // it is important that A still displaces B on iteration 1.
        //
        // To accomplish this, we apply this rule: the subsystem which
        // displaces is always the one nearest (center to center) to the
        // subsystem being moved (i.e. the first parameter of this function).
        //
        // Special case: the subsyssAstem being moved is always displacing.
        const ssACandidateCenterX =
          ssACandidate.specification.position.x + ssACandidate.size.width / 2;

        const ssaCandidateCenterY =
          ssACandidate.specification.position.y + ssACandidate.size.height / 2;

        const ssACandidateDistance = Math.sqrt(
          Math.pow(ssACandidateCenterX - centerSS.x, 2) +
            Math.pow(ssaCandidateCenterY - centerSS.y, 2),
        );

        const ssBCandidateCenterX =
          ssBCandidate.specification.position.x + ssBCandidate.size.width / 2;

        const ssBCandidateCenterY =
          ssBCandidate.specification.position.y + ssBCandidate.size.height / 2;

        const ssBCandidateDistance = Math.sqrt(
          Math.pow(ssBCandidateCenterX - centerSS.x, 2) +
            Math.pow(ssBCandidateCenterY - centerSS.y, 2),
        );

        // Subsystem displacing.
        const ssA =
          ssACandidate.canonicalId === system.canonicalId ||
          ssACandidateDistance < ssBCandidateDistance
            ? ssACandidate
            : ssBCandidate;

        // Subsystem being displaced.
        const ssB =
          ssA.canonicalId === ssACandidate.canonicalId
            ? ssBCandidate
            : ssACandidate;

        const aPositionX1 = ssA.specification.position.x - SystemMargin;
        const aPositionX2 =
          ssA.specification.position.x + ssA.size.width + SystemMargin;
        const aPositionY1 = ssA.specification.position.y - SystemMargin;
        const aPositionY2 =
          ssA.specification.position.y + ssA.size.height + SystemMargin;

        const bPositionX1 = ssB.specification.position.x - SystemMargin;
        const bPositionX2 =
          ssB.specification.position.x + ssB.size.width + SystemMargin;
        const bPositionY1 = ssB.specification.position.y - SystemMargin;
        const bPositionY2 =
          ssB.specification.position.y + ssB.size.height + SystemMargin;

        // Calculate the area of intersection,
        // which is a rectangle [0, 0, X, Y].
        const overlapX = Math.max(
          0,
          Math.min(aPositionX2, bPositionX2) -
            Math.max(aPositionX1, bPositionX1),
        );

        const overlapY = Math.max(
          0,
          Math.min(aPositionY2, bPositionY2) -
            Math.max(aPositionY1, bPositionY1),
        );

        // No overlap.
        if (overlapX === 0 || overlapY === 0) {
          continue;
        }

        const aCenterX = (aPositionX1 + aPositionX2) / 2;
        const aCenterY = (aPositionY1 + aPositionY2) / 2;

        let bCenterX = (bPositionX1 + bPositionX2) / 2;
        const bCenterY = (bPositionY1 + bPositionY2) / 2;

        if (aCenterX === bCenterX && aCenterY === bCenterY) {
          bCenterX += 1;
        }

        const centerToCenterMagnitude = Math.sqrt(
          Math.pow(bCenterX - aCenterX, 2) + Math.pow(bCenterY - aCenterY, 2),
        );

        const centerToCenterUnitVectorX =
          (bCenterX - aCenterX) / centerToCenterMagnitude;

        const centerToCenterUnitVectorY =
          (bCenterY - aCenterY) / centerToCenterMagnitude;

        // TODO:
        //
        // find the optimal length of displacement
        // to reduce the number of iterations.
        const displacementLength = 1;

        const displacementX =
          centerToCenterUnitVectorX >= 0
            ? Math.ceil(centerToCenterUnitVectorX * displacementLength) | 0
            : Math.floor(centerToCenterUnitVectorX * displacementLength) | 0;

        const displacementY =
          centerToCenterUnitVectorY >= 0
            ? Math.ceil(centerToCenterUnitVectorY * displacementLength) | 0
            : Math.floor(centerToCenterUnitVectorY * displacementLength) | 0;

        console.log(
          ssA.canonicalId,
          "collides",
          overlapX,
          overlapY,
          "with",
          ssB.canonicalId,
          "move",
          ssB.canonicalId,
          displacementX,
          displacementY,
          "in direction",
          centerToCenterUnitVectorX,
          centerToCenterUnitVectorY,
        );

        // TODO: quick test. Instead of a radial displacement, try a
        // horizontal / vertical displacement.
        if (Math.abs(displacementX) > Math.abs(displacementY)) {
          ssB.specification.position.x += displacementX;
        } else {
          ssB.specification.position.y += displacementY;
        }

        displacedThisIteration.push(
          [ssA.canonicalId, ssB.canonicalId].join("."),
        );
        displacedThisIteration.push(
          [ssB.canonicalId, ssA.canonicalId].join("."),
        );
      }
    }
  } while (displacedThisIteration.length && iterations < 1000);
}
