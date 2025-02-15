"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expoUseDomDirectivePlugin = void 0;
/**
 * Copyright © 2024 650 Industries.
 */
const core_1 = require("@babel/core");
const crypto_1 = __importDefault(require("crypto"));
const path_1 = require("path");
const url_1 = __importDefault(require("url"));
const common_1 = require("./common");
function expoUseDomDirectivePlugin(api) {
    // TODO: Is exporting
    const isProduction = api.caller(common_1.getIsProd);
    const platform = api.caller((caller) => caller?.platform);
    return {
        name: 'expo-use-dom-directive',
        visitor: {
            Program(path, state) {
                // Native only feature.
                if (platform === 'web') {
                    return;
                }
                const hasUseDomDirective = path.node.directives.some((directive) => directive.value.value === 'use dom');
                const filePath = state.file.opts.filename;
                if (!filePath) {
                    // This can happen in tests or systems that use Babel standalone.
                    throw new Error('[Babel] Expected a filename to be set in the state');
                }
                // File starts with "use dom" directive.
                if (!hasUseDomDirective) {
                    // Do nothing for code that isn't marked as a dom component.
                    return;
                }
                // Assert that a default export must exist and that no other exports should be present.
                // NOTE: In the future we could support other exports with extraction.
                let hasDefaultExport = false;
                // Collect all of the exports
                path.traverse({
                    ExportNamedDeclaration(path) {
                        throw path.buildCodeFrameError('Modules with the "use dom" directive only support a single default export.');
                    },
                    ExportDefaultDeclaration() {
                        hasDefaultExport = true;
                    },
                });
                if (!hasDefaultExport) {
                    throw path.buildCodeFrameError('The "use dom" directive requires a default export to be present in the file.');
                }
                const outputKey = url_1.default.pathToFileURL(filePath).href;
                const proxyModule = [
                    `import React from 'react';
import { WebView } from 'expo/dom/internal';`,
                ];
                if (isProduction) {
                    // MUST MATCH THE EXPORT COMMAND!
                    const hash = crypto_1.default.createHash('sha1').update(outputKey).digest('hex');
                    if (platform === 'ios') {
                        const outputName = `www.bundle/${hash}.html`;
                        proxyModule.push(`const source = { uri: ${JSON.stringify(outputName)} };`);
                    }
                    else if (platform === 'android') {
                        // TODO: This is a guess.
                        const outputName = `www/${hash}.html`;
                        proxyModule.push(`const source = { uri: "file:///android_asset" + ${JSON.stringify(outputName)} };`);
                    }
                    else {
                        throw new Error('production "use dom" directive is not supported yet for platform: ' + platform);
                    }
                }
                else {
                    proxyModule.push(
                    // Add the basename to improve the Safari debug preview option.
                    `const source = { uri: new URL("/_expo/@dom/${(0, path_1.basename)(filePath)}?file=" + ${JSON.stringify(outputKey)}, require("react-native/Libraries/Core/Devtools/getDevServer")().url).toString() };`);
                }
                proxyModule.push(`
export default React.forwardRef((props, ref) => {
  return React.createElement(WebView, { ref, ...props, source });
});`);
                // Clear the body
                path.node.body = [];
                path.node.directives = [];
                path.pushContainer('body', core_1.template.ast(proxyModule.join('\n')));
                assertExpoMetadata(state.file.metadata);
                // Save the client reference in the metadata.
                state.file.metadata.expoDomComponentReference = outputKey;
            },
        },
    };
}
exports.expoUseDomDirectivePlugin = expoUseDomDirectivePlugin;
function assertExpoMetadata(metadata) {
    if (metadata && typeof metadata === 'object') {
        return;
    }
    throw new Error('Expected Babel state.file.metadata to be an object');
}
