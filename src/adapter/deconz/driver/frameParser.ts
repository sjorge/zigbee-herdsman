const MIN_BUFFER_SIZE = 3;
const littleEndian = true;
import PARAM from './constants';
import { busyQueue } from './driver';
import { Request, Command, ParamMac, ParamPanId, ParamNwkAddr, ParamExtPanId, ParamChannel, ParamChannelMask } from './constants';

import Debug from 'debug';
const debug = Debug('zigbee-herdsman:deconz:frameParser');



function isValidCommandId(id: Number) : Boolean {
    return true;
}

function parseReadParameterResponse(view: DataView) : Command {
    const parameterId = view.getUint8(7);

    switch (parameterId) {
        case PARAM.PARAM.Network.MAC:
            const mac: ParamMac = view.getBigUint64(8, littleEndian).toString(16);
            debug(`MAC: ${mac}`);
            return mac;
        case PARAM.PARAM.Network.PAN_ID:
            const panId: ParamPanId = view.getUint16(8, littleEndian);
            debug('PANID: ' + panId.toString(16));
            return panId;
        case PARAM.PARAM.Network.NWK_ADDRESS:
            const nwkAddr: ParamNwkAddr = view.getUint16(8, littleEndian);
            debug('NWKADDR: ' + nwkAddr.toString(16));
            return nwkAddr;
        case PARAM.PARAM.Network.EXT_PAN_ID:
            const extPanId: ParamExtPanId = view.getBigUint64(8, littleEndian).toString(16);
            debug(`EXT_PANID: ${extPanId}`);
            return extPanId;
        case PARAM.PARAM.Network.CHANNEL:
            const channel: ParamChannel = view.getUint8(8);
            debug('CHANNEL: ' + channel);
            return channel;
        case PARAM.PARAM.Network.CHANNEL_MASK:
            const chMask: ParamChannelMask = view.getUint32(8, littleEndian);
            debug('CHANNELMASK: ' + chMask.toString(16));
            return chMask;
        default:
            throw new Error("unknown parameter id");
    }
}

function parseReadFirmwareResponse(view : DataView) : number[] {
    const fw = [view.getUint8(5), view.getUint8(6), view.getUint8(7), view.getUint8(8)];
    debug("read firmware version response - version: " + fw);
    return fw;
}

function parseWriteParameterResponse(view : DataView) : number {
    const parameterId = view.getUint8(7);
    debug(`write parameter response - parameter id: ${parameterId}`);
    return parameterId;

}

function getParserForCommandId(id: Number) : Function {
    switch (id) {
        case PARAM.PARAM.FrameType.ReadParameter:
            return parseReadParameterResponse;
        case PARAM.PARAM.FrameType.WriteParameter:
            return parseWriteParameterResponse;
        case PARAM.PARAM.FrameType.ReadFirmwareVersion:
            return parseReadFirmwareResponse;
        default:
            throw new Error(`unknown command id ${id}`);
    }
}

async function processFrame(frame: Uint8Array) : Promise<void> {
    const [seqNumber, status, command] = await parseFrame(frame);
    debug(`process frame with seq: ${seqNumber} status: ${status}`);

    const i = busyQueue.findIndex((r: Request) => r.seqNumber === seqNumber);
    if (i < 0)
        return;

    const req: Request = busyQueue[i];

    if (status !== 0) {
        // reject if status is not SUCCESS
        req.reject({status});
    } else {
        req.resolve(command);
    }

    //remove from busyqueue
    busyQueue.splice(i, 1);
}

function parseFrame(frame: Uint8Array) : [number, number, Command] {

    if (frame.length < MIN_BUFFER_SIZE) {
        throw new Error("received frame size to small");
    }

    const view = new DataView(frame.buffer);

    const commandId = view.getUint8(0);
    const seqNumber = view.getUint8(1);
    const status = view.getUint8(2);

    if (!isValidCommandId(commandId)) {
        throw new Error("No valid command Id: " + commandId);
    }

    const frameLength = view.getUint16(3, littleEndian);
    const payloadLength = view.getUint16(5, littleEndian);
    // todo check framelength, payloadlength < x

    const parser = getParserForCommandId(commandId);
    return [seqNumber, status, parser(view)];

}

export default processFrame;