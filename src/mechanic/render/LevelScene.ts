import Phaser from 'phaser';
import { tapEngine } from '../engine/tapEngine.ts';
import type { Level, LevelState } from '../engine/types.ts';
import type { SceneTheme } from './theme.ts';

/** Target radius as a fraction of the shorter canvas edge — thumb-sized on a phone. */
const TARGET_RADIUS_RATIO = 0.085;
const MIN_TARGET_RADIUS = 22;

export interface LevelSceneOptions {
  level: Level;
  theme: SceneTheme;
  onComplete: () => void;
  onStateChange: (state: LevelState) => void;
}

/**
 * The rendering and input half of the mechanic.
 *
 * All rules live in ../engine — this scene only draws state and turns pointer
 * events into engine inputs. Keeping that split is what makes the rules
 * testable without a browser.
 */
export class LevelScene extends Phaser.Scene {
  readonly #options: LevelSceneOptions;
  readonly #circles = new Map<string, Phaser.GameObjects.Arc>();
  /**
   * Hit areas are kept by reference rather than read back off `circle.input`,
   * whose `hitArea` is typed `any`. Phaser hit-tests in the object's local
   * space with the display origin added, so for an Arc of radius r the centre
   * sits at (r, r).
   */
  readonly #hitAreas = new Map<string, Phaser.Geom.Circle>();

  #state: LevelState;
  #completed = false;

  #handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.cameras.resize(gameSize.width, gameSize.height);
    this.#layout(gameSize.width, gameSize.height);
  };

  constructor(options: LevelSceneOptions) {
    super({ key: 'level' });
    this.#options = options;
    this.#state = tapEngine.create(options.level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.#options.theme.background);

    for (const target of this.#options.level.targets) {
      const circle = this.add.circle(0, 0, MIN_TARGET_RADIUS, this.#options.theme.target);
      circle.setStrokeStyle(3, this.#options.theme.targetStroke);

      const hitArea = new Phaser.Geom.Circle(
        MIN_TARGET_RADIUS,
        MIN_TARGET_RADIUS,
        MIN_TARGET_RADIUS,
      );
      circle.setInteractive(hitArea, (area: Phaser.Geom.Circle, x: number, y: number) =>
        Phaser.Geom.Circle.Contains(area, x, y),
      );
      circle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.#tap(target.id);
      });

      this.#circles.set(target.id, circle);
      this.#hitAreas.set(target.id, hitArea);
    }

    this.#layout(this.scale.width, this.scale.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#handleResize);
    });

    this.#options.onStateChange(this.#state);
  }

  #layout(width: number, height: number): void {
    const radius = Math.max(MIN_TARGET_RADIUS, Math.min(width, height) * TARGET_RADIUS_RATIO);

    for (const target of this.#options.level.targets) {
      const circle = this.#circles.get(target.id);
      const hitArea = this.#hitAreas.get(target.id);
      if (circle === undefined || hitArea === undefined) continue;

      // setRadius also updates the Arc's size and display origin.
      circle.setRadius(radius);
      circle.setPosition(target.x * width, target.y * height);
      hitArea.setTo(radius, radius, radius);
    }
  }

  #tap(targetId: string): void {
    if (this.#completed) return;

    this.#state = tapEngine.apply(this.#state, { type: 'tap', targetId });

    const circle = this.#circles.get(targetId);
    if (circle !== undefined && !this.#state.remaining.includes(targetId)) {
      circle.disableInteractive();
      this.tweens.add({
        targets: circle,
        scale: 0,
        alpha: 0,
        duration: 140,
        ease: 'Quad.easeIn',
      });
    }

    this.#options.onStateChange(this.#state);

    if (tapEngine.isComplete(this.#state)) {
      this.#completed = true;
      // Let the last tween land before the shell drops a popup over the board.
      this.time.delayedCall(180, this.#options.onComplete);
    }
  }
}
