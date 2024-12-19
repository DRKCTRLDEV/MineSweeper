declare const ko: {
    observable: <T>(initialValue?: T) => KnockoutObservable<T>;
    observableArray: <T>(initialValue?: T[]) => KnockoutObservableArray<T>;
    computed: <T>(evaluator: () => T) => KnockoutComputed<T>;
    pureComputed: <T>(evaluator: () => T) => KnockoutComputed<T>;
    applyBindings: (viewModel: any, rootNode?: any) => void;
};

declare const _: any;

type KnockoutObservable<T> = any;
type KnockoutObservableArray<T> = any;
type KnockoutComputed<T> = any;

class MinesweeperCell {
    isFlagged: KnockoutObservable<boolean>;
    isRevealed: KnockoutObservable<boolean>;
    isMine: boolean;
    adjacent: KnockoutObservable<number>;

    constructor(public x: number, public y: number, private parent: MinesweeperGrid) {
        this.isFlagged = ko.observable(false);
        this.isRevealed = ko.observable(false);
        this.adjacent = ko.observable(0);
        this.isMine = false;
    }

    reveal() {
        if (this.parent.isGameOver() || this.isRevealed() || this.isFlagged())
            return;

        this.parent.mouseDown(false);

        if (this.isMine) {
            this.parent.revealMines();
            if ('vibrate' in navigator) {
                navigator.vibrate(1500);
            }
        } else {
            this.isRevealed(true);
            this.parent.incrementRevealed();

            if (this.adjacent() === 0) {
                // propogate through and auto-reveal recursively. 
                this.parent.revealAdjacentCells(this);
            }
        }
    }

    // when mouse is being held down
    suspense() {
        if (!this.isRevealed() && !this.isFlagged())
            this.parent.mouseDown(true);
    }

    // when mouse is lifted
    relief() {
        this.parent.mouseDown(false);
    }

    flag() {
        if (this.parent.isGameOver() || this.isRevealed())
            return;

        this.parent.mouseDown(false);

        if (this.isFlagged()) {
            this.parent.removeFlag();
        } else {
            this.parent.useFlag();
        }

        if ('vibrate' in navigator) {
            navigator.vibrate(this.isFlagged() ? [100, 100, 100] : [200]);
        }

        this.isFlagged(!this.isFlagged());
        return false; // prevent event propogation
    }

    cellText = ko.pureComputed(() => {
        if (this.isRevealed() && this.isMine)
            return '✺';

        if (this.isRevealed() && this.adjacent() > 0)
            return this.adjacent();

        if (this.isFlagged())
            return '⚐';

        return '&nbsp;'
    })

    cellCss = ko.pureComputed(() => {
        let classes: string[] = [];
        if (!this.isMine && this.adjacent() > 0)
            classes.push(`cell-adjacent-${this.adjacent()}`);
        if (this.isFlagged())
            classes.push('flagged');
        if (this.isMine)
            classes.push('mine');
        if (this.isRevealed())
            classes.push('revealed');
        if (this.parent.touchScreen)
            classes.push('touch-screen');

        return classes.join(' ');
    })
}

interface MinesweeperDifficulty {
    name: string;
    width: KnockoutObservable<number>;
    height: KnockoutObservable<number>;
    mines: KnockoutObservable<number>;
    updateWidthValue: (data: any, event: Event) => void;
    updateHeightValue: (data: any, event: Event) => void;
    updateMinesValue: (data: any, event: Event) => void;
    maxMines: KnockoutComputed<number>;
}

class MinesweeperGame {
    difficulties: KnockoutObservableArray<MinesweeperDifficulty>;
    started: KnockoutObservable<boolean>;
    selectedDifficulty: KnockoutObservable<MinesweeperDifficulty | null>;
    grid: KnockoutObservable<MinesweeperGrid | null>;
    startButtonAnimation: KnockoutObservable<string>;

    constructor() {
        this.difficulties = ko.observableArray([
            {
                name: 'Beginner',
                width: ko.observable(8),
                height: ko.observable(8),
                mines: ko.observable(10),
                updateWidthValue: () => {},
                updateHeightValue: () => {},
                updateMinesValue: () => {},
                maxMines: ko.computed(() => 0)
            },
            {
                name: 'Intermediate',
                width: ko.observable(16),
                height: ko.observable(16),
                mines: ko.observable(40),
                updateWidthValue: () => {},
                updateHeightValue: () => {},
                updateMinesValue: () => {},
                maxMines: ko.computed(() => 0)
            },
            {
                name: 'Expert',
                width: ko.observable(30),
                height: ko.observable(16),
                mines: ko.observable(99),
                updateWidthValue: () => {},
                updateHeightValue: () => {},
                updateMinesValue: () => {},
                maxMines: ko.computed(() => 0)
            },
            {
                name: 'Custom',
                width: ko.observable(20),
                height: ko.observable(20),
                mines: ko.observable(50),
                updateWidthValue: () => {},
                updateHeightValue: () => {},
                updateMinesValue: () => {},
                maxMines: ko.computed(() => 0)
            }
        ]);

        this.started = ko.observable(false);
        this.selectedDifficulty = ko.observable<MinesweeperDifficulty | null>(null);
        this.grid = ko.observable<MinesweeperGrid | null>(null);
                
        // Use type assertion for custom properties
        this.difficulties().forEach((difficulty: MinesweeperDifficulty) => {
            difficulty.updateWidthValue = this.createUpdateFunction(difficulty.width, difficulty);
            difficulty.updateHeightValue = this.createUpdateFunction(difficulty.height, difficulty);
            difficulty.updateMinesValue = this.createUpdateFunction(difficulty.mines, difficulty);
        });

        // Update the custom difficulty
        const customDifficulty = this.difficulties().find((d: MinesweeperDifficulty) => d.name === 'Custom') as MinesweeperDifficulty;
        if (customDifficulty) {
            customDifficulty.updateWidthValue = this.createUpdateFunction(customDifficulty.width, customDifficulty);
            customDifficulty.updateHeightValue = this.createUpdateFunction(customDifficulty.height, customDifficulty);
            customDifficulty.updateMinesValue = this.createUpdateFunction(customDifficulty.mines, customDifficulty);
            customDifficulty.maxMines = ko.computed(() => {
                return Math.floor(customDifficulty.width() * customDifficulty.height() * 0.95);
            });
        }

        // Set initial selected difficulty
        this.selectedDifficulty(this.difficulties()[0]);

        this.loadSettings();
    }

    start() {
        const difficulty = this.selectedDifficulty();
        if (!difficulty) return;

        const { width, height, mines } = difficulty;

        this.ensureNumber(width, height, mines);

        if (width() < 5 || height() < 5 || width() > 45 || height() > 45) {
            alert('Playing space must be between 5x5 and 45x45.');
            return;
        }

        if ((width() * height()) <= mines() + 2 || mines() < 2) {
            alert('Invalid number of mines. Need at least two blank cells and two mines.');
            return;
        }

        this.started(true);
        this.grid(new MinesweeperGrid(difficulty));
        const currentGrid = this.grid();
        if (currentGrid) {
            currentGrid.isGameOver.subscribe((gameOver: boolean) => {
                if (gameOver) {
                    this.gameOver(currentGrid.wonGame);
                }
            });
        }
    }

    // Improve type safety for ensureNumber method
    ensureNumber(...observables: KnockoutObservable<number>[]) {
        observables.forEach(observable => {
            let value = observable();
            if (typeof value === 'string') {
                observable(parseInt(value, 10));
            }
        });
    }

    gameOver(won: boolean) {
        const res = won ? 'Congratulations!\n' : 'Game over!\n';
        console.info(res);
    }

    reset = () => {
        this.grid(null);
        this.start();
    }

    hardReset = () => {
        this.grid(null);
        this.started(false);
    }

    // Add this new method to create update functions for sliders
    private createUpdateFunction(observable: KnockoutObservable<number>, difficulty: MinesweeperDifficulty) {
        return (data: any, event: Event) => {
            const value = parseInt((event.target as HTMLInputElement).value);
            if (!isNaN(value)) {
                observable(value);
                
                // Ensure mines don't exceed the maximum
                const maxMines = difficulty.maxMines();
                if (difficulty.mines() > maxMines) {
                    difficulty.mines(maxMines);
                }

                // Force an update of the computed observables
                difficulty.maxMines.notifySubscribers();
                
                // Save settings when custom values change
                this.saveSettings();
            }
        };
    }

    toggleDropdown() {
        const dropdown = document.querySelector('.custom-dropdown');
        dropdown?.classList.toggle('active');
    }

    selectDifficulty(difficulty: MinesweeperDifficulty) {
        this.selectedDifficulty(difficulty);
        this.saveSettings();
        this.toggleDropdown();
    }

    // Add this method to initialize event listeners
    initializeDropdownHandlers() {
        document.addEventListener('click', (e: Event) => {
            const dropdown = document.querySelector('.custom-dropdown');
            const target = e.target as HTMLElement;
            if (!target.closest('.custom-dropdown')) {
                dropdown?.classList.remove('active');
            }
        });
    }

    private saveSettings() {
        const settings = {
            selectedDifficulty: this.selectedDifficulty()?.name,
            custom: this.difficulties().find((difficulty: MinesweeperDifficulty) => difficulty.name === 'Custom') && {
                width: this.difficulties().find((difficulty: MinesweeperDifficulty) => difficulty.name === 'Custom')?.width(),
                height: this.difficulties().find((difficulty: MinesweeperDifficulty) => difficulty.name === 'Custom')?.height(),
                mines: this.difficulties().find((difficulty: MinesweeperDifficulty) => difficulty.name === 'Custom')?.mines()
            }
        };
        localStorage.setItem('minesweeperSettings', JSON.stringify(settings));
    }

    private loadSettings() {
        const savedSettings = localStorage.getItem('minesweeperSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            
            // Restore custom difficulty settings if they exist
            if (settings.custom) {
                const customDifficulty = this.difficulties().find((difficulty: MinesweeperDifficulty) => difficulty.name === 'Custom');
                if (customDifficulty) {
                    customDifficulty.width(settings.custom.width);
                    customDifficulty.height(settings.custom.height);
                    customDifficulty.mines(settings.custom.mines);
                }
            }

            // Restore selected difficulty
            if (settings.selectedDifficulty) {
                const difficulty = this.difficulties().find((difficulty: MinesweeperDifficulty) => difficulty.name === settings.selectedDifficulty);
                if (difficulty) {
                    this.selectedDifficulty(difficulty);
                }
            }
        }
    }
}

class MinesweeperGrid {
    static offsets = [
        { x: -1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: -1 },

        { x: -1, y: 0 },
        { x: 1, y: 0 },

        { x: -1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ];

    cells: KnockoutObservableArray<MinesweeperCell>;
    isGameOver: KnockoutObservable<boolean>;
    usedFlags: KnockoutObservable<number>;
    mouseDown: KnockoutObservable<boolean>;
    timer: number;
    secondsPlayed: KnockoutObservable<number>;
    wonGame: boolean;
    totalRevealed: number;
    initialized: boolean;
    touchScreen: boolean;

    constructor(public difficulty: MinesweeperDifficulty) {
        this.isGameOver = ko.observable(false);
        this.wonGame = false;
        this.usedFlags = ko.observable(0);
        this.mouseDown = ko.observable(false);
        this.totalRevealed = 0;
        this.initialized = false;
        this.touchScreen = 'ontouchstart' in window;
        this.timer = 0;
        this.secondsPlayed = ko.observable(0);

        this.cells = ko.observableArray<MinesweeperCell>([]);
        this.createCells();
    }

    init() {
        this.assignMines();
        this.computeAdjacencies();
        this.initialized = true;
        this.timer = setInterval(this.tick, 1000);
    }

    createCells() {
        const { width, height } = this.difficulty;
        this.cells(_.flatten(
            _.range(height()).map((y: number) => _.range(width()).map((x: number) =>
                new MinesweeperCell(x, y, this)
            ))
        ));
    }

    assignMines() {
        const { mines } = this.difficulty;
        const cells = this.cells().filter((cell: MinesweeperCell) => !cell.isRevealed());
        const mineCells = _.sampleSize(cells, Math.min(mines(), cells.length - 2));
        mineCells.forEach((cell: MinesweeperCell) => cell.isMine = true);
    }

    computeAdjacencies() {
        const grid = this.cellRows();
        grid.forEach((row: MinesweeperCell[], y: number) => {
            row.forEach((cell: MinesweeperCell, x: number) => {
                const adjacent = _.sumBy(MinesweeperGrid.offsets, (offset: { x: number; y: number }) => {
                    const cX = x + offset.x;
                    const cY = y + offset.y;
                    if (this.inRange(grid, cX, cY)) {
                        return grid[cY][cX].isMine ? 1 : 0;
                    }
                    return 0;
                });
                cell.adjacent(adjacent);
            })
        })
    }

    inRange(grid: MinesweeperCell[][], x: number, y: number) {
        return (y in grid) && (x in grid[y]);
    }

    revealMines() {
        this.cells().forEach((cell: MinesweeperCell) => {
            if (cell.isMine) {
                if (!cell.isRevealed())
                    this.totalRevealed++;

                cell.isRevealed(true);
            }
        });
        this.gameOver(false);
    }

    useFlag() {
        this.usedFlags(this.usedFlags() + 1);
    }

    removeFlag() {
        this.usedFlags(this.usedFlags() - 1);
    }

    autoFlag() {
        this.cells().forEach((cell: MinesweeperCell) => {
            if (cell.isFlagged()) return;
            if (cell.isMine) {
                cell.isFlagged(true);
                this.useFlag();
            }
        });
    }

    incrementRevealed() {
        this.totalRevealed++;
        const { width, height, mines } = this.difficulty;
        const numNonMines = (width() * height()) - mines();
        if (this.totalRevealed === numNonMines) {
            this.autoFlag();
            this.gameOver(true);
        }

        if (!this.initialized)
            this.init();
    }

    gameOver(won: boolean) {
        this.wonGame = won;
        this.isGameOver(true);
        clearInterval(this.timer);
        this.timer = 0;
    }

    revealAdjacentCells(current: MinesweeperCell, done: MinesweeperCell[] = []) {
        done.push(current);
        const grid = this.cellRows();
        MinesweeperGrid.offsets.forEach(offset => {
            const nX = current.x + offset.x;
            const nY = current.y + offset.y;
            if (this.inRange(grid, nX, nY)) {
                let next = grid[nY][nX];
                if (done.indexOf(next) > -1) return;

                if (next.adjacent() === 0) {
                    this.revealAdjacentCells(next, done);
                }
                if (!next.isRevealed()) {
                    this.incrementRevealed();
                    next.isRevealed(true);
                    if (next.isFlagged()) {
                        this.removeFlag();
                        next.isFlagged(false);
                    }
                }
            }
        })
    }

    cellRows = ko.pureComputed(() => {
        return _.chunk(this.cells(), this.difficulty.width());
    });

    flagsRemaining = ko.pureComputed(() => {
        return this.difficulty.mines() - this.usedFlags();
    });

    timeString = ko.pureComputed(() => {
        const seconds = this.secondsPlayed();
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        const padZero = (num: number): string => {
            return num < 10 ? '0' + num : num.toString();
        };
        
        return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
    });

    tick = () => {
        this.secondsPlayed(this.secondsPlayed() + 1);
    };
}

// Define the global game object
const game = new MinesweeperGame();

// Attach the game object to the window
(window as any).game = game;

window.onload = () => {
    ko.applyBindings(game);
};

game.started.subscribe((started: boolean) => {
    if (started) {
        console.log('Started a new game!', 'Difficulty:', game.selectedDifficulty()?.name ?? 'Unknown');
    }
});

// Improve type safety for the global game object
declare global {
    interface Window {
        game: MinesweeperGame;
    }
}

window.game = game;

export {};
