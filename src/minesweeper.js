class MinesweeperCell {
    constructor(x, y, parent) {
        this.x = x;
        this.y = y;
        this.parent = parent;
        this.cellText = ko.pureComputed(() => {
            if (this.isRevealed() && this.isMine)
                return '✺';
            if (this.isRevealed() && this.adjacent() > 0)
                return this.adjacent();
            if (this.isFlagged())
                return '⚐';
            return '&nbsp;';
        });
        this.cellCss = ko.pureComputed(() => {
            let classes = [];
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
        });
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
        }
        else {
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
        }
        else {
            this.parent.useFlag();
        }
        if ('vibrate' in navigator) {
            navigator.vibrate(this.isFlagged() ? [100, 100, 100] : [200]);
        }
        this.isFlagged(!this.isFlagged());
        return false; // prevent event propogation
    }
}
class MinesweeperGame {
    constructor() {
        this.reset = () => {
            this.grid(null);
            this.start();
        };
        this.hardReset = () => {
            this.grid(null);
            this.started(false);
        };
        this.difficulties = ko.observableArray([
            {
                name: 'Beginner',
                width: ko.observable(8),
                height: ko.observable(8),
                mines: ko.observable(10)
            },
            {
                name: 'Intermediate',
                width: ko.observable(16),
                height: ko.observable(16),
                mines: ko.observable(40)
            },
            {
                name: 'Expert',
                width: ko.observable(30),
                height: ko.observable(16),
                mines: ko.observable(99)
            },
            {
                name: 'Custom',
                width: ko.observable(20),
                height: ko.observable(20),
                mines: ko.observable(50)
            }
        ]);
        this.started = ko.observable(false);
        this.selectedDifficulty = ko.observable(null);
        this.grid = ko.observable(null);
        // Use type assertion for custom properties
        this.difficulties().forEach((difficulty) => {
            difficulty.updateWidthValue = this.createUpdateFunction(difficulty.width);
            difficulty.updateHeightValue = this.createUpdateFunction(difficulty.height);
            difficulty.updateMinesValue = this.createUpdateFunction(difficulty.mines);
        });
    }
    start() {
        const difficulty = this.selectedDifficulty();
        if (!difficulty)
            return;
        const { width, height, mines } = difficulty;
        this.ensureNumber(width, height, mines);
        if (width() < 5 || height() < 5) {
            alert('Playing space is too small. Must be at least 5x5.');
            return;
        }
        if (width() > 45 || height() > 45) {
            alert('Playing space is too large. May be at most 45x45.');
            return;
        }
        if ((width() * height()) <= mines() + 1) {
            alert('Too many mines! Need at least two blank cells.');
            return;
        }
        if (mines() < 2) {
            alert('Need at least two mines!');
            return;
        }
        this.started(true);
        this.grid(new MinesweeperGrid(difficulty));
        const currentGrid = this.grid();
        if (currentGrid) {
            currentGrid.isGameOver.subscribe((gameOver) => {
                if (gameOver) {
                    this.gameOver(currentGrid.wonGame);
                }
            });
        }
    }
    // Improve type safety for ensureNumber method
    ensureNumber(...observables) {
        observables.forEach(observable => {
            let value = observable();
            if (typeof value === 'string') {
                observable(parseInt(value, 10));
            }
        });
    }
    gameOver(won) {
        const res = won ? 'Congratulations!\n' : 'Game over!\n';
        console.info(res);
    }
    // Add this new method to create update functions for sliders
    createUpdateFunction(observable) {
        return () => {
            let value = parseInt(observable());
            if (!isNaN(value)) {
                observable(value);
            }
        };
    }
}
class MinesweeperGrid {
    constructor(difficulty) {
        this.difficulty = difficulty;
        this.gameState = ko.pureComputed(() => {
            if (this.isGameOver()) {
                if (this.wonGame)
                    return 'status-winner';
                else
                    return 'status-dead';
            }
            if (this.mouseDown())
                return 'status-worried';
            else
                return 'status-happy';
        });
        this.cellRows = ko.pureComputed(() => {
            return _.chunk(this.cells(), this.difficulty.width());
        });
        this.flagsRemaining = ko.pureComputed(() => {
            return this.difficulty.mines() - this.usedFlags();
        });
        this.timeString = ko.pureComputed(() => {
            let seconds = this.secondsPlayed();
            let minutes = Math.floor(seconds / 60);
            if (minutes)
                seconds %= 60;
            let str = ((seconds < 10) ? "0" + seconds : String(seconds)) + "s";
            if (minutes)
                str = ((minutes < 10) ? "0" + minutes : String(minutes)) + "m " + str;
            return str;
        });
        this.tick = () => {
            this.secondsPlayed(this.secondsPlayed() + 1);
        };
        this.isGameOver = ko.observable(false);
        this.wonGame = false;
        this.usedFlags = ko.observable(0);
        this.mouseDown = ko.observable(false);
        this.totalRevealed = 0;
        this.initialized = false;
        this.touchScreen = 'ontouchstart' in window;
        this.timer = 0;
        this.secondsPlayed = ko.observable(0);
        this.cells = ko.observableArray([]);
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
        this.cells(_.flatten(_.range(height()).map((y) => _.range(width()).map((x) => new MinesweeperCell(x, y, this)))));
    }
    assignMines() {
        const { mines } = this.difficulty;
        const cells = this.cells().filter((cell) => !cell.isRevealed());
        const mineCells = _.sampleSize(cells, mines());
        mineCells.forEach((cell) => cell.isMine = true);
    }
    computeAdjacencies() {
        const grid = this.cellRows();
        grid.forEach((row, y) => {
            row.forEach((cell, x) => {
                const adjacent = _.sumBy(MinesweeperGrid.offsets, (offset) => {
                    const cX = x + offset.x;
                    const cY = y + offset.y;
                    if (this.inRange(grid, cX, cY)) {
                        return grid[cY][cX].isMine ? 1 : 0;
                    }
                    return 0;
                });
                cell.adjacent(adjacent);
            });
        });
    }
    inRange(grid, x, y) {
        return (y in grid) && (x in grid[y]);
    }
    revealMines() {
        this.cells().forEach((cell) => {
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
        this.cells().forEach((cell) => {
            if (cell.isFlagged())
                return;
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
    gameOver(won) {
        this.wonGame = won;
        this.isGameOver(true);
        clearInterval(this.timer);
        this.timer = 0;
    }
    revealAdjacentCells(current, done = []) {
        done.push(current);
        const grid = this.cellRows();
        MinesweeperGrid.offsets.forEach(offset => {
            const nX = current.x + offset.x;
            const nY = current.y + offset.y;
            if (this.inRange(grid, nX, nY)) {
                let next = grid[nY][nX];
                if (done.indexOf(next) > -1)
                    return;
                if (next.adjacent() === 0) {
                    this.revealAdjacentCells(next, done);
                }
                if (!next.isRevealed()) {
                    this.incrementRevealed();
                }
                if (next.isFlagged()) {
                    this.removeFlag();
                    next.isFlagged(false);
                }
                next.isRevealed(true);
            }
        });
    }
}
MinesweeperGrid.offsets = [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
];
// Define the global game object
const game = new MinesweeperGame();
// Attach the game object to the window
window.game = game;
window.onload = () => {
    ko.applyBindings(game);
};
game.started.subscribe((started) => {
    var _a, _b;
    if (started) {
        console.log('Started a new game!', 'Difficulty:', (_b = (_a = game.selectedDifficulty()) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Unknown');
    }
});
// Add this to the end of your existing TypeScript file
document.addEventListener('DOMContentLoaded', () => {
    const controlsToggle = document.getElementById('controls-toggle');
    const controlsOverlay = document.getElementById('controls-overlay');
    const controlsContent = controlsOverlay === null || controlsOverlay === void 0 ? void 0 : controlsOverlay.querySelector('.controls-content');
    if (controlsToggle && controlsOverlay && controlsContent) {
        controlsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            controlsOverlay.style.display = 'flex';
            // Remove positioning logic, as it's handled by CSS now
            void controlsOverlay.offsetWidth;
            controlsOverlay.classList.add('active');
        });
        const hideOverlay = () => {
            controlsOverlay.classList.remove('active');
            setTimeout(() => {
                controlsOverlay.style.display = 'none';
            }, 300); // Wait for the transition to complete
        };
        controlsOverlay.addEventListener('click', (event) => {
            if (event.target === controlsOverlay) {
                hideOverlay();
            }
        });
    }
});
window.game = game;
export {};
