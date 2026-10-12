export const translatePathData = (pathData: string, dx: number, dy: number) => {
    const tokens = pathData.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    const output: string[] = [];
    let index = 0;
    let command = "";
    const readToken = () => tokens[index++];
    const readNumber = () => Number(readToken());
    const pushNumber = (value: number) => output.push(String(value));
    while (index < tokens.length) {
        const token = readToken();
        if (/^[MLQAZ]$/i.test(token)) {
            command = token.toUpperCase();
            output.push(command);
        }
        else {
            index -= 1;
        }
        if (command === "M" || command === "L") {
            pushNumber(readNumber() + dx);
            pushNumber(readNumber() + dy);
            continue;
        }
        if (command === "Q") {
            pushNumber(readNumber() + dx);
            pushNumber(readNumber() + dy);
            pushNumber(readNumber() + dx);
            pushNumber(readNumber() + dy);
            continue;
        }
        if (command === "A") {
            pushNumber(readNumber());
            pushNumber(readNumber());
            pushNumber(readNumber());
            pushNumber(readNumber());
            pushNumber(readNumber());
            pushNumber(readNumber() + dx);
            pushNumber(readNumber() + dy);
            continue;
        }
    }
    return output.join(" ");
};
export const scalePathData = (pathData: string, factor: number, origin: [
    number,
    number
]) => {
    const tokens = pathData.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    const output: string[] = [];
    let index = 0;
    let command = "";
    const [originX, originY] = origin;
    const scaleX = (value: number) => originX + (value - originX) * factor;
    const scaleY = (value: number) => originY + (value - originY) * factor;
    const readToken = () => tokens[index++];
    const readNumber = () => Number(readToken());
    const pushNumber = (value: number) => output.push(String(value));
    while (index < tokens.length) {
        const token = readToken();
        if (/^[MLQAZ]$/i.test(token)) {
            command = token.toUpperCase();
            output.push(command);
        }
        else {
            index -= 1;
        }
        if (command === "M" || command === "L") {
            pushNumber(scaleX(readNumber()));
            pushNumber(scaleY(readNumber()));
            continue;
        }
        if (command === "Q") {
            pushNumber(scaleX(readNumber()));
            pushNumber(scaleY(readNumber()));
            pushNumber(scaleX(readNumber()));
            pushNumber(scaleY(readNumber()));
            continue;
        }
        if (command === "A") {
            pushNumber(readNumber() * factor);
            pushNumber(readNumber() * factor);
            pushNumber(readNumber());
            pushNumber(readNumber());
            pushNumber(readNumber());
            pushNumber(scaleX(readNumber()));
            pushNumber(scaleY(readNumber()));
        }
    }
    return output.join(" ");
};
