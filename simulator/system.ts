import PathFinderGrid from "./pathfinding/grid";
import { PathFinder } from "./pathfinding/finder";

import {
  RuntimeSystem,
  RuntimeLimits,
  RuntimeSubsystem,
  RuntimeLink,
  TitleCharsPerSquare,
  SystemMargin,
} from "@dataflows/spec";

// TODO: add SystemTopLeftCorner, SystemTopRightCorner, ...
// TODO: add LinkRightTurn, LinkDownTurn, ...
export enum SimulatorObjectType {
  BlackBox = 1,
  WhiteBox = 2,
  Link = 3,
  Port = 4,
  SystemMargin = 5,
  SystemTitle = 6,
  SystemTitlePadding = 7,
  SystemTopLeftCorner = 8,
  SystemTopRightCorner = 9,
  SystemBottomLeftCorner = 10,
  SystemBottomRightCorner = 11,
}

export interface SimulatorObject {
  type: SimulatorObjectType;
}

export interface SimulatorBlackBox extends SimulatorObject {
  type: SimulatorObjectType.BlackBox;
  system: RuntimeSubsystem;
}

export interface SimulatorWhiteBox extends SimulatorObject {
  type: SimulatorObjectType.WhiteBox;
  system: RuntimeSubsystem;
}

export interface SimulatorLink extends SimulatorObject {
  type: SimulatorObjectType.Link;
  link: RuntimeLink;
}

export interface SimulatorPort extends SimulatorObject {
  type: SimulatorObjectType.Port;
  system: RuntimeSubsystem;
}

export interface SimulatorSystemMargin extends SimulatorObject {
  type: SimulatorObjectType.SystemMargin;
  system: RuntimeSystem | RuntimeSubsystem;
}

export interface SimulatorSystemTitle extends SimulatorObject {
  type: SimulatorObjectType.SystemTitle;
  system: RuntimeSubsystem;
  chars: string;
}

export interface SimulatorSystemTitlePadding extends SimulatorObject {
  type: SimulatorObjectType.SystemTitlePadding;
  system: RuntimeSubsystem;
}

export interface SimulatorSystemTopLeftCorner extends SimulatorObject {
  type: SimulatorObjectType.SystemTopLeftCorner;
  system: RuntimeSubsystem;
}

export interface SimulatorSystemTopRightCorner extends SimulatorObject {
  type: SimulatorObjectType.SystemTopRightCorner;
  system: RuntimeSubsystem;
}

export interface SimulatorSystemBottomLeftCorner extends SimulatorObject {
  type: SimulatorObjectType.SystemBottomLeftCorner;
  system: RuntimeSubsystem;
}

export interface SimulatorSystemBottomRightCorner extends SimulatorObject {
  type: SimulatorObjectType.SystemBottomRightCorner;
  system: RuntimeSubsystem;
}

const PaddingWhiteBox = 2;

interface GridSystem {
  canonicalId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: {
    x: number;
    y: number;
  }[];
  title: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  hidden: boolean;
}

export class SystemSimulator {
  private system: RuntimeSystem;
  private routes: Record<string, Record<string, number[][]>>;
  private gridSystems: Record<string, GridSystem>;
  private grid: SimulatorObject[][][];

  constructor(system: RuntimeSystem) {
    this.system = system;
    this.routes = {};
    this.gridSystems = {};
    this.grid = new Array(RuntimeLimits.MaxSystemHeight);

    // Create grid.
    for (let i = 0; i < RuntimeLimits.MaxSystemWidth; i++) {
      this.grid[i] = Array.from(
        { length: RuntimeLimits.MaxSystemWidth },
        () => [],
      );
    }

    // TODO: faster way to initialize?
    const finderGrid = new PathFinderGrid(
      this.grid.map(row => row.map(() => 1)),
    );

    // Compute grid objects.
    this.initializeGridObjects(system);
    this.computeGridVisibility(system, false);
    this.computeGridObjectSizesAndPositions(system);
    this.computeGridObjectPorts(system);
    this.computeGridObjectTitles(system);

    // System margin.
    const simulatorMargin: SimulatorSystemMargin = Object.freeze({
      type: SimulatorObjectType.SystemMargin,
      system,
    });

    for (let x = 0; x < RuntimeLimits.MaxSystemWidth; x++) {
      this.grid[x]![0]!.push(simulatorMargin);
      finderGrid.setWeightAt(x, 0, Infinity);

      this.grid[x]![RuntimeLimits.MaxSystemHeight - 1]!.push(simulatorMargin);
      finderGrid.setWeightAt(x, RuntimeLimits.MaxSystemHeight - 1, Infinity);
    }

    for (let y = 0; y < RuntimeLimits.MaxSystemHeight; y++) {
      this.grid[0]![y]!.push(simulatorMargin);
      finderGrid.setWeightAt(0, y, Infinity);

      this.grid[RuntimeLimits.MaxSystemWidth - 1]![y]!.push(simulatorMargin);
      finderGrid.setWeightAt(RuntimeLimits.MaxSystemWidth - 1, y, Infinity);
    }

    // Add sub-systems & ports.
    const toDraw: RuntimeSubsystem[] = [...this.system.systems];

    while (toDraw.length) {
      const ss = toDraw.shift()!;

      const blackbox = !ss.systems.length || ss.hideSystems;

      if (!blackbox) {
        for (const sss of ss.systems) {
          toDraw.push(sss);
        }
      }

      const gridSS = this.gridSystems[ss.canonicalId]!;


      // Sub-system margin.
      const simulatorSystemMargin: SimulatorSystemMargin = Object.freeze({
        type: SimulatorObjectType.SystemMargin,
        system: ss,
      });

      for (
        let x = gridSS.x - SystemMargin;
        x <
        Math.min(
          gridSS.x + gridSS.width + SystemMargin,
          RuntimeLimits.MaxSystemWidth,
        );
        x++
      ) {
        const top = gridSS.y - SystemMargin;
        const bottom = gridSS.y + gridSS.height - 1 + SystemMargin;

        if (top < RuntimeLimits.MaxSystemHeight) {
          this.grid[x]![top]!.push(simulatorSystemMargin);
          finderGrid.setWeightAt(x, top, Infinity);
        }

        if (bottom < RuntimeLimits.MaxSystemHeight) {
          this.grid[x]![bottom]!.push(simulatorSystemMargin);
          finderGrid.setWeightAt(x, bottom, Infinity);
        }
      }

      for (
        let y = gridSS.y - SystemMargin;
        y <
        Math.min(
          gridSS.y + gridSS.height + SystemMargin,
          RuntimeLimits.MaxSystemHeight,
        );
        y++
      ) {
        const left = gridSS.x - SystemMargin;
        const right = gridSS.x + gridSS.width - 1 + SystemMargin;

        if (left < RuntimeLimits.MaxSystemWidth) {
          this.grid[left]![y]!.push(simulatorSystemMargin);
          finderGrid.setWeightAt(left, y, Infinity);
        }

        if (right < RuntimeLimits.MaxSystemWidth) {
          this.grid[right]![y]!.push(simulatorSystemMargin);
          finderGrid.setWeightAt(right, y, Infinity);
        }
      }

      // Sub-systems.
      const simulatorSystem: SimulatorBlackBox | SimulatorWhiteBox =
        Object.freeze({
          type: blackbox
            ? SimulatorObjectType.BlackBox
            : SimulatorObjectType.WhiteBox,
          system: ss,
        });

      const simulatorSystemTopLeftCorner: SimulatorSystemTopLeftCorner =
        Object.freeze({
          type: SimulatorObjectType.SystemTopLeftCorner,
          system: ss,
        });

      const simulatorSystemTopRightCorner: SimulatorSystemTopRightCorner =
        Object.freeze({
          type: SimulatorObjectType.SystemTopRightCorner,
          system: ss,
        });

      const simulatorSystemBottomLeftCorner: SimulatorSystemBottomLeftCorner =
        Object.freeze({
          type: SimulatorObjectType.SystemBottomLeftCorner,
          system: ss,
        });

      const simulatorSystemBottomRightCorner: SimulatorSystemBottomRightCorner =
        Object.freeze({
          type: SimulatorObjectType.SystemBottomRightCorner,
          system: ss,
        });

      for (
        let x = gridSS.x;
        x < Math.min(gridSS.x + gridSS.width, RuntimeLimits.MaxSystemWidth);
        x++
      ) {
        for (
          let y = gridSS.y;
          y < Math.min(gridSS.y + gridSS.height, RuntimeLimits.MaxSystemHeight);
          y++
        ) {
          this.grid[x]![y]!.push(simulatorSystem);

          if (x === gridSS.x && y == gridSS.y) {
            this.grid[x]![y]!.push(simulatorSystemTopLeftCorner);
          }

          if (x === gridSS.x + gridSS.width - 1 && y == gridSS.y) {
            this.grid[x]![y]!.push(simulatorSystemTopRightCorner);
          }

          if (x === gridSS.x && y == gridSS.y + gridSS.height - 1) {
            this.grid[x]![y]!.push(simulatorSystemBottomLeftCorner);
          }

          if (
            x === gridSS.x + gridSS.width - 1 &&
            y == gridSS.y + gridSS.height - 1
          ) {
            this.grid[x]![y]!.push(simulatorSystemBottomRightCorner);
          }

          finderGrid.setWeightAt(x, y, blackbox ? Infinity : 1);
        }
      }

      // Ports.
      const simulatorPort: SimulatorPort = Object.freeze({
        type: SimulatorObjectType.Port,
        system: ss,
      });

      for (const port of gridSS.ports) {
        if (
          port.x < RuntimeLimits.MaxSystemWidth &&
          port.y < RuntimeLimits.MaxSystemHeight
        ) {
          this.grid[port.x]![port.y]!.push(simulatorPort);
          finderGrid.setWeightAt(port.x, port.y, 1);
        }
      }

      // Title padding.
      const simulatorSystemTitlePadding: SimulatorSystemTitlePadding =
        Object.freeze({
          type: SimulatorObjectType.SystemTitlePadding,
          system: ss,
        });

      for (
        let x = gridSS.title.x - 1;
        x <
        Math.min(
          gridSS.title.x + gridSS.title.width + 1,
          RuntimeLimits.MaxSystemWidth,
        );
        x++
      ) {
        for (
          let y = gridSS.title.y - 1;
          y <
          Math.min(
            gridSS.title.y + gridSS.title.height + 1,
            RuntimeLimits.MaxSystemHeight,
          );
          y++
        ) {
          this.grid[x]![y]!.push(simulatorSystemTitlePadding);
          finderGrid.setWeightAt(x, y, Infinity);
        }
      }

      // Title.
      const titleLines = ss.title.split("\n");

      for (
        let x = gridSS.title.x, i = 0;
        x <
        Math.min(
          gridSS.title.x + gridSS.title.width,
          RuntimeLimits.MaxSystemWidth,
        );
        x++, i++
      ) {
        for (
          let y = gridSS.title.y, j = 0;
          y <
          Math.min(
            gridSS.title.y + gridSS.title.height,
            RuntimeLimits.MaxSystemHeight,
          );
          y++, j++
        ) {
          const simulatorSystemTitle: SimulatorSystemTitle = {
            type: SimulatorObjectType.SystemTitle,
            system: ss,
            chars: titleLines[j]!.slice(
              i * TitleCharsPerSquare,
              i * TitleCharsPerSquare + TitleCharsPerSquare,
            ),
          };

          this.grid[x]![y]!.push(simulatorSystemTitle);
          finderGrid.setWeightAt(x, y, Infinity);
        }
      }
    }

    // Add links (pathfinding).
    const finder = new PathFinder({
      avoidStaircase: true,
      turnPenalty: 1,
    });

    for (const link of this.system.links) {
      const subsystemA = this.gridSystems[link.a]!;
      const subsystemB = this.gridSystems[link.b]!;

      // The link references two sub-systems that are hidden inside a blackbox.
      if (subsystemA.hidden && subsystemB.hidden) {
        continue;
      }

      const subsystemAPorts = subsystemA.ports.filter(
        port =>
          this.grid[port.x]?.[port.y]?.at(-1)?.type ===
          SimulatorObjectType.Port,
      );

      const subsystemBPorts = subsystemB.ports.filter(
        port =>
          this.grid[port.x]?.[port.y]?.at(-1)?.type ===
          SimulatorObjectType.Port,
      );

      const candidates = subsystemAPorts
        .flatMap(portA =>
          subsystemBPorts.map(portB => ({
            portA,
            portB,
            distance: Math.sqrt(
              Math.pow(portB.x - portA.x, 2) + Math.pow(portB.y - portA.y, 2),
            ),
          })),
        )
        .sort((a, b) => a.distance - b.distance);

      for (const { portA, portB } of candidates) {
        finderGrid.reset();

        const route = finder.findPath(
          portA.x,
          portA.y,
          portB.x,
          portB.y,
          finderGrid,
        );

        if (route.length) {
          this.routes[link.a] ??= {};
          this.routes[link.a]![link.b] = route;

          this.routes[link.b] ??= {};
          this.routes[link.b]![link.a] = route.slice().reverse();

          const simulatorLink: SimulatorLink = Object.freeze({
            type: SimulatorObjectType.Link,
            link,
          });

          for (const [x, y] of route) {
            this.grid[x!]![y!]!.push(simulatorLink);

            // A path is still considered walkable but it has a higher cost
            // than an Empty tile. It enables tunnels.
            finderGrid.setWeightAt(x!, y!, 2);
          }

          break;
        }
      }
    }
  }

  getLayout(): SimulatorObject[][][] {
    return this.grid;
  }

  // Get the boundaries of the system, i.e. a rectangle that encompass all
  // sub-systems, links, etc.
  getBoundaries(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } {
    let left = RuntimeLimits.MaxSystemWidth;
    let right = 0;
    let top = RuntimeLimits.MaxSystemHeight;
    let bottom = 0;

    for (let i = 0; i < RuntimeLimits.MaxSystemWidth; i++) {
      for (let j = 0; j < RuntimeLimits.MaxSystemHeight; j++) {
        const hasVisibleObjects = this.grid[i]![j]!.some(
          obj =>
            obj.type === SimulatorObjectType.BlackBox ||
            obj.type === SimulatorObjectType.WhiteBox ||
            obj.type === SimulatorObjectType.Link,
        );

        if (!hasVisibleObjects) {
          continue;
        }

        if (i < left) {
          left = i;
        }

        if (i > right) {
          right = i;
        }

        if (j < top) {
          top = j;
        }

        if (j > bottom) {
          bottom = j;
        }
      }
    }

    return {
      left,
      right,
      top,
      bottom,
    };
  }

  getAvailableSpaceForSystems(): boolean[][] {
    const available = new Array(RuntimeLimits.MaxSystemHeight);

    for (let i = 0; i < RuntimeLimits.MaxSystemWidth; i++) {
      available[i] = Array.from(
        { length: RuntimeLimits.MaxSystemWidth },
        () => [],
      );
    }

    for (let i = 0; i < RuntimeLimits.MaxSystemWidth; i++) {
      for (let j = 0; j < RuntimeLimits.MaxSystemHeight; j++) {
        available[i][j] =
          this.grid[i]![j]!.length === 0 ||
          this.grid[i]![j]!.every(
            object => object.type === SimulatorObjectType.Link,
          );
      }
    }

    return available;
  }

  getRoute(fromSystemId: string, toSystemId: string): number[][] | undefined {
    return this.routes[fromSystemId]?.[toSystemId];
  }

  private initializeGridObjects(
    system: RuntimeSystem | RuntimeSubsystem,
  ): void {
    // Depth-first traversal.
    for (const ss of system.systems) {
      this.initializeGridObjects(ss);
    }

    // Root system.
    if (!system.canonicalId) {
      return;
    }

    // Initialize system.
    const gridObject = {
      canonicalId: system.canonicalId,
      x: -1,
      y: -1,
      width: -1,
      height: -1,
      ports: [],
      title: {
        x: -1,
        y: -1,
        width: -1,
        height: -1,
      },
      hidden: false,
    };

    this.gridSystems[system.canonicalId] = gridObject;
  }

  private computeGridVisibility(
    system: RuntimeSystem | RuntimeSubsystem,
    hidden: boolean,
  ): void {
    // Depth-first traversal.
    for (const ss of system.systems) {
      this.computeGridVisibility(ss, hidden || ss.hideSystems);
    }

    // Root system.
    if (!system.canonicalId) {
      return;
    }

    const gridObject = this.gridSystems[system.canonicalId]!;

    gridObject.hidden = !system.hideSystems && hidden;
  }

  private computeGridObjectSizesAndPositions(
    system: RuntimeSystem | RuntimeSubsystem,
  ): void {
    const gridObject = system.canonicalId
      ? this.gridSystems[system.canonicalId]!
      : { x: 0, y: 0, hidden: false, width: 0, height: 0 };

    for (const ss of system.systems) {
      // Set base positions (as if all blackboxes)
      const ssGridObject = this.gridSystems[ss.canonicalId]!;

      ssGridObject.x = gridObject.x + ss.position.x;
      ssGridObject.y = gridObject.y + ss.position.y;

      if (system.canonicalId) {
        ssGridObject.x += PaddingWhiteBox;

        ssGridObject.y += PaddingWhiteBox;
        ssGridObject.y += system.titlePosition.y + system.titleSize.height - 1;
      }

      // Depth-first traversal.
      this.computeGridObjectSizesAndPositions(ss);
    }

    // Hidden system (inside blackbox).
    if (gridObject.hidden) {
      gridObject.width = 0;
      gridObject.height = 0;

      return;
    }

    // Blackbox or empty whitebox.
    if (system.hideSystems || !system.systems.length) {
      gridObject.width = system.size.width;
      gridObject.height = system.size.height;

      return;
    }

    //
    // Open Whitebox.
    //

    // Whiteboxes take additional space on the grid and displace other
    // sub-systems to the right and bottom.
    //
    // The position of a sub-system vis-a-vis a blackbox determines if it
    // will be displaced to the right or to the bottom by its whitebox
    // sibling.
    //
    //  A-------------B--E
    //  | Black box   |
    //  D-------------C--F
    //  |             |
    //  H             G
    //
    //  If you imagine the outer lines B-E, C-F, C-G, D-H going to infinity,
    //
    //  - The sub-system is pushed toward the *right* when
    //    its geometry (rectangle) collides with B-E-F-C (rectangle).
    //
    //  - The sub-system is pushed toward the *bottom* when
    //    its geometry (rectangle) collides with D-C-G-H (rectangle).
    //
    //  Additionally, the sub-system is pushed toward the *right* when
    //  its geometry (rectangle) collides with C-F-?-G. The twist here
    //  is that the value of B-C is the one from the whitebox sibling,
    //  so we have:
    //
    //  A-------------B--E
    //  | White box   | Pushed to right.
    //  D-------------C--F
    //  | Pushed to   | Pushed to right.
    //  H bottom.     G
    //
    const collides = (
      ax0: number,
      ax1: number,
      ay0: number,
      ay1: number,
      bx0: number,
      bx1: number,
      by0: number,
      by1: number,
    ): boolean =>
      ax0 /* aLeft */ < bx1 /* bRight */ &&
      ax1 /* aRight */ > bx0 /* bLeft */ &&
      ay0 /* aTop */ < by1 /* bBottom */ &&
      ay1 /* aBottom */ > by0 /* bTop */;

    const displacements: {
      x: {
        canonicalId: string;
        x0: number;
        // x1: infinity
        y0: number;
        y1: number;
        amount: number;
      }[];
      y: {
        canonicalId: string;
        y0: number;
        // y1: infinity
        x0: number;
        x1: number;
        amount: number;
      }[];
    } = { x: [], y: [] };

    const sortedLeftToRight = system.systems.sort(
      (ssA, ssB) => ssA.position.x - ssB.position.x,
    );

    for (const ss of sortedLeftToRight) {
      const ssGridObject = this.gridSystems[ss.canonicalId]!;

      for (const displacement of displacements.x) {
        if (
          collides(
            ss.position.x,
            ss.position.x + ssGridObject.width,
            ss.position.y,
            ss.position.y + ssGridObject.height,
            displacement.x0,
            Number.MAX_SAFE_INTEGER,
            displacement.y0,
            displacement.y1,
          )
        ) {
          ssGridObject.x += displacement.amount;
        }
      }

      if (!ss.hideSystems && ss.systems.length) {
        displacements.x.push({
          canonicalId: ss.canonicalId,
          x0: ss.position.x + ss.size.width - 1 + SystemMargin * 2,
          y0: ss.position.y - SystemMargin * 2,
          // ssGridObject.height is used here instead of ss.size.height.
          // See note above on this algorithm to know why.
          y1: ss.position.y + ssGridObject.height - 1 + SystemMargin * 2,
          amount: ssGridObject.width - ss.size.width,
        });
      }
    }

    const sortedTopToBottom = system.systems.sort(
      (ssA, ssB) => ssA.position.y - ssB.position.y,
    );

    for (const ss of sortedTopToBottom) {
      const ssGridObject = this.gridSystems[ss.canonicalId]!;

      for (const displacement of displacements.y) {
        if (
          collides(
            ss.position.x,
            ss.position.x + ssGridObject.width,
            ss.position.y,
            ss.position.y + ssGridObject.height,
            displacement.x0,
            displacement.x1,
            displacement.y0,
            Number.MAX_SAFE_INTEGER,
          )
        ) {
          ssGridObject.y += displacement.amount;
        }
      }

      if (!ss.hideSystems && ss.systems.length) {
        displacements.y.push({
          canonicalId: ss.canonicalId,
          y0: ss.position.y + ss.size.height - 1,
          x0: ss.position.x - SystemMargin * 2,
          x1: ss.position.x + ss.size.width - 1 + SystemMargin * 2,
          amount: ssGridObject.height - ss.size.height,
        });
      }
    }

    // Calculate size.
    let maxWidth = 0;
    let maxHeight = 0;

    for (const ss of system.systems) {
      const ssGridObject = this.gridSystems[ss.canonicalId]!;

      const width = ssGridObject.x - gridObject.x + ssGridObject.width;
      const height = ssGridObject.y - gridObject.y + ssGridObject.height;

      if (width > maxWidth) {
        maxWidth = width;
      }

      if (height > maxHeight) {
        maxHeight = height;
      }
    }

    // +----------------------+
    // | Title                |
    // | +-----+    +-----+   |
    // | | Foo |====| Bar |   |
    // | +-----+    +-----+   |
    // +----------------------+

    if (system.titleSize.width > maxWidth) {
      maxWidth = system.titleSize.width;
    }

    gridObject.width = maxWidth + PaddingWhiteBox;
    gridObject.height = maxHeight + system.titleSize.height + PaddingWhiteBox;
  }

  private computeGridObjectPorts(
    system: RuntimeSystem | RuntimeSubsystem,
  ): void {
    for (const ss of system.systems) {
      const gridObject = this.gridSystems[ss.canonicalId]!;
      const blackbox = ss.hideSystems;

      // When the sub-system is hidden, it has the same ports as its parent.
      // I am not making a deep copy here because it is not necessary and
      // save some CPU cycles but beware!
      if (gridObject.hidden) {
        gridObject.ports = this.gridSystems[system.canonicalId!]!.ports;
        // Whitebox.
      } else if (!blackbox && ss.systems.length) {
        gridObject.ports = [];

        for (let x = 1; x < gridObject.width; x += 2) {
          gridObject.ports.push({ x: gridObject.x + x, y: gridObject.y - 1 });

          gridObject.ports.push({
            x: gridObject.x + x,
            y: gridObject.y + gridObject.height,
          });
        }

        for (let y = 1; y < gridObject.height; y += 2) {
          gridObject.ports.push({ x: gridObject.x - 1, y: gridObject.y + y });

          gridObject.ports.push({
            x: gridObject.x + gridObject.width,
            y: gridObject.y + y,
          });
        }
        // Blackbox.
      } else {
        gridObject.ports = ss.ports.map(port => ({
          x: gridObject.x + port.x,
          y: gridObject.y + port.y,
        }));
      }
    }

    // Breadth-first traversal.
    for (const ss of system.systems) {
      this.computeGridObjectPorts(ss);
    }
  }

  private computeGridObjectTitles(
    system: RuntimeSystem | RuntimeSubsystem,
  ): void {
    // Depth-first traversal.
    for (const ss of system.systems) {
      this.computeGridObjectTitles(ss);
    }

    // Root system.
    if (!system.canonicalId) {
      return;
    }

    const gridObject = this.gridSystems[system.canonicalId]!;

    if (gridObject.hidden) {
      return;
    }

    gridObject.title = {
      x: gridObject.x + system.titlePosition.x,
      y: gridObject.y + system.titlePosition.y,
      width: system.titleSize.width,
      height: system.titleSize.height,
    };
  }
}
