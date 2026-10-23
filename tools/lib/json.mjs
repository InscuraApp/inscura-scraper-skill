// Strict JSON parsing: rejects duplicate keys and non-finite numbers, which
// JSON.parse silently accepts or cannot express.

export class JsonError extends Error {}

export function parseStrictJson(source, label = "JSON") {
    let index = 0;

    function fail(message) {
        const before = source.slice(0, index);
        const line = before.split("\n").length;
        const column = index - before.lastIndexOf("\n");
        throw new JsonError(label + ": " + message + " at line " + line + ", column " + column);
    }

    function skip() {
        while (index < source.length && " \t\r\n".includes(source[index])) index += 1;
    }

    function expect(text) {
        if (source.startsWith(text, index)) {
            index += text.length;
            return;
        }
        fail("expected " + JSON.stringify(text));
    }

    function string() {
        const start = index;
        expect('"');
        while (index < source.length) {
            const char = source[index];
            if (char === '"') {
                index += 1;
                return JSON.parse(source.slice(start, index));
            }
            if (char === "\\") index += 2;
            else if (char < " ") fail("control character in string");
            else index += 1;
        }
        fail("unterminated string");
    }

    function number() {
        const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(index));
        if (!match) fail("invalid number");
        index += match[0].length;
        const value = Number(match[0]);
        if (!Number.isFinite(value)) fail("non-finite JSON number " + match[0]);
        return value;
    }

    function value() {
        skip();
        const char = source[index];
        if (char === "{") {
            index += 1;
            const result = {};
            const keys = new Set();
            skip();
            if (source[index] === "}") {
                index += 1;
                return result;
            }
            for (;;) {
                skip();
                const key = string();
                if (keys.has(key)) fail("duplicate JSON key " + JSON.stringify(key));
                keys.add(key);
                skip();
                expect(":");
                Object.defineProperty(result, key, { value: value(), enumerable: true, writable: true, configurable: true });
                skip();
                if (source[index] === ",") {
                    index += 1;
                    continue;
                }
                expect("}");
                return result;
            }
        }
        if (char === "[") {
            index += 1;
            const result = [];
            skip();
            if (source[index] === "]") {
                index += 1;
                return result;
            }
            for (;;) {
                result.push(value());
                skip();
                if (source[index] === ",") {
                    index += 1;
                    continue;
                }
                expect("]");
                return result;
            }
        }
        if (char === '"') return string();
        if (char === "t") return expect("true"), true;
        if (char === "f") return expect("false"), false;
        if (char === "n") return expect("null"), null;
        return number();
    }

    if (source.charCodeAt(0) === 0xfeff) index = 1;
    const result = value();
    skip();
    if (index !== source.length) fail("unexpected trailing content");
    return result;
}
