"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = retry;
exports.executePromise = executePromise;
exports.executePromiseAndCallback = executePromiseAndCallback;
exports.mapSeries = mapSeries;
const wait_1 = __importDefault(require("wait"));
function retry(fn, retries, delay) {
    return new Promise((resolve, reject) => {
        function attempt(retries) {
            fn()
                .then(resolve)
                .catch((err) => {
                if (retries > 0) {
                    (0, wait_1.default)(delay)
                        .then(() => attempt(retries - 1))
                        .catch(reject);
                }
                else {
                    reject(err);
                }
            });
        }
        attempt(retries);
    });
}
function executePromise(fn, callback) {
    if (callback) {
        fn().then(callback.success).catch(callback.error);
    }
    return fn();
}
function executePromiseAndCallback(p, callback) {
    p.then((result) => {
        callback.success && callback.success(result);
    }).catch((err) => {
        callback.error && callback.error(err);
    });
    return p;
}
async function mapSeries(array, iterator) {
    const result = [];
    for (let i = 0; i < array.length; i++) {
        const value = await iterator(array[i], i);
        result.push(value);
    }
    return result;
}
//# sourceMappingURL=helper.js.map