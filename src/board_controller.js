/**
 * @file MVCのコントローラのオブザーバークラスです。
 */
/*
 * @author 市川雄二
 * @copyright 2017 ICHIKAWA, Yuji (New 3 Rs)
 * @license MIT
 */
/* global JGO:false, WAudio:false */

import { WAudio } from './waudio.js';

const stoneSound = new WAudio('audio/go-piece1.mp3');

/**
 *  jGoBoardのためのコントローラです。 
 * @see {@link https://github.com/jokkebk/jgoboard}
 */
export class BoardController {
    /**
     * jGoBoardを生成し、描画が終わったらcallbackを呼び出します。
     * @param {Integer} boardSize 
     * @param {Integer} handicap 
     * @param {number} komi 
     * @param {Function} callback 
     */
    constructor(boardSize, handicap, komi, callback) {
        this.id = 'board';
        this.ownColor = JGO.BLACK; // ownColorはGUIを使用する側
        this.turn = JGO.BLACK;
        this.jrecord = null;
        this.jboard = null;
        this.ko = false;
        this.lastHover = null;
        this.lastMove = null;
        this.observers = [];
        this.passNum = 0;

        this.jrecord = JGO.sgf.load(`(;SZ[${boardSize}]KM[${komi}])`, false);
        this.jboard = this.jrecord.getBoard();
        if (handicap >= 2) {
            const stones = JGO.util.getHandicapCoordinates(this.jboard.width,
                handicap);
            this.jboard.setType(stones, JGO.BLACK);
            this.turn = JGO.WHITE;
        }

        const options = { stars: {points: 9 }};
        JGO.util.extend(options, JGO.BOARD.large);
        const jsetup = new JGO.Setup(this.jboard, options);
        jsetup.setOptions({ coordinates: {
            top: false,
            bottom: false,
            left: false,
            right: false
        }});

        jsetup.create(this.id, canvas => {
            canvas.addListener('click', this.clickHander.bind(this));
            canvas.addListener('mousemove', this.moveHandler.bind(this));
            canvas.addListener('mouseout', this.leaveHandler.bind(this));
            canvas.addListener('mousedown', this.downHandler.bind(this));
            callback(this);
        });
    }

    /**
     * 関連のオブザーバーやDOMを破棄します。 
     */
    destroy() {
        this.removeObservers();
        const dom = document.getElementById(this.id);
        while (dom.firstChild) {
            dom.removeChild(dom.firstChild);
        }
    }

    /**
     * GUIを使用する側の石の色を設定します。
     */
    setOwnColor(color) {
        this.ownColor = color;
    }

    /**
     * コミを設定します。
     * @param {*} komi 
     */
    setKomi(komi) {
        const node = this.jrecord.getRootNode();
        node.info.komi = komi.toString();
    }

    /**
     * オブザーバーを追加し、オブザーバーのupdateを呼び出します。
     * @param {*} observer 引数にcoordを受け取るupdateメソッドを持つオブジェクト。
     */
    addObserver(observer) {
        this.observers.push(observer);
        observer.update();
    }

    /**
     * 全オブザーバーを削除します。
     */
    removeObservers() {
        this.observers = [];
    }

    /**
     * jGoBoardが更新されたときに呼び出されるメソッドです。
     * @private
     * @param {*} coord 
     */
    update(coord) {
        const node = this.jrecord.getCurrentNode();
        document.getElementById('opponent-captures').innerText =
            node.info.captures[this.ownColor === JGO.BLACK ? JGO.WHITE : JGO.BLACK];
        document.getElementById('own-captures').innerText =
            node.info.captures[this.ownColor];
        setTimeout(() => {
            this.observers.forEach(function(observer) {
                observer.update(coord);
            });
        }, 10); // 0ではjGoBoardのレンダリングが終わっていないので、10にしました。
    }

    /**
     * 着手します。
     * @param {JGO.Coordinate} coord 
     * @param {bool} sound 
     */
    play(coord, sound = false) {
        const play = this.jboard.playMove(coord, this.turn, this.ko);
        if (!play.success) {
            console.log(coord, play);
            return play.success;
        }
        const node = this.jrecord.createNode(false);
        // tally captures
        node.info.captures[this.turn] += play.captures.length;
        if (coord) {
            // play stone
            node.setType(coord, this.turn);
            node.setMark(coord, JGO.MARK.CIRCLE); // mark move
            // clear opponent's stones
            node.setType(play.captures, JGO.CLEAR);
        }
        if(this.lastMove) {
            node.setMark(this.lastMove, JGO.MARK.NONE); // clear previous mark
        }
        if(this.ko) {
            node.setMark(this.ko, JGO.MARK.NONE); // clear previous ko mark
        }
        this.lastMove = coord;
        if(play.ko) {
            node.setMark(play.ko, JGO.MARK.CIRCLE); // mark ko, too
        }
        this.ko = play.ko;
        this.turn = this.turn === JGO.BLACK ? JGO.WHITE : JGO.BLACK;
        if (coord == null) {
            this.passNum += 1;
            this.update(this.passNum < 2 ? 'pass' : 'end');
        } else {
            this.passNum = 0;
            this.update(coord);
            if (sound) {
                stoneSound.play();
            }
        }
        return play.success;
    }

    /**
     * @private
     * @param {JGO.Coordinate} coord 
     * @param {Event} ev 
     */
    clickHander(coord, ev) {
        // clear hover away - it'll be replaced or
        // then it will be an illegal move in any case
        // so no need to worry about putting it back afterwards
        if (this.ownColor !== this.turn) {
            return;
        }
        if (this.lastHover != null) {
            this.jboard.setType(this.lastHover, JGO.CLEAR);
            this.lastHover = null;
        }
        if (coord.i >= 0 && coord.i < this.jboard.width &&
            coord.j >= 0 && coord.j < this.jboard.height) {
            this.play(coord);
        }
    }

    /**
     * @private
     * @param {JGO.Coordinate} coord 
     * @param {Event} ev 
     */
    moveHandler(coord, ev) {
        if (this.ownColor !== this.turn) {
            return;
        }
        if (this.lastHover && this.lastHover.equals(coord)) {
            return;
        }

        if (this.lastHover != null) { // clear previous hover if there was one
            this.jboard.setType(this.lastHover, JGO.CLEAR);
        }

        if (coord.i <= -1 || coord.j <= -1 ||
            coord.i >= this.jboard.width || coord.j >= this.jboard.height) {
            this.lastHover = null;
        } else if (this.jboard.getType(coord) === JGO.CLEAR &&
            this.jboard.getMark(coord) == JGO.MARK.NONE) {
            this.jboard.setType(coord,
                this.turn == JGO.BLACK ? JGO.DIM_BLACK : JGO.DIM_WHITE);
            this.lastHover = coord;
        } else {
            this.lastHover = null;
        }
    }

    /**
     * @private
     * @param {Event} ev 
     */
    leaveHandler(ev) {
        if (this.lastHover != null) {
            this.jboard.setType(this.lastHover, JGO.CLEAR);
            this.lastHover = null;
        }
    }

    /**
     * クリックではなくてダウン/タッチで石音を立てたいのでここで処理しています。
     * @private
     * @param {Event} ev 
     */
    downHandler(ev) {
        if (this.ownColor === this.turn) {
            stoneSound.play();
        }
    }
}
