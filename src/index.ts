import { Cell, loadMessage } from "@ton/core";

const BoC = 'Some//Base64//encoded+stuff'

console.log(
    loadMessage(
        Cell
        .fromBase64(BoC)
        .beginParse()
    )
);
