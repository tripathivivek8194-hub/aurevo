"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalSetup;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const TEST_DB_URL = 'file:./test-e2e.db';
function globalSetup() {
    const apiRoot = path.resolve(__dirname, '..');
    const schemaDir = path.join(apiRoot, 'prisma');
    const dbFile = path.join(schemaDir, 'test-e2e.db');
    for (const suffix of ['', '-journal']) {
        const file = dbFile + suffix;
        if (fs.existsSync(file)) {
            fs.rmSync(file, { force: true });
        }
    }
    (0, node_child_process_1.execSync)('npx prisma migrate deploy', {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: TEST_DB_URL, NODE_ENV: 'test' },
        stdio: 'inherit',
    });
}
//# sourceMappingURL=global-setup.js.map