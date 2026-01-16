/**
 * WireLang Core - Components Index
 * Re-exports all component classes and factory functions
 */

// Passive components
export { Resistor, R } from './Resistor';
export { Capacitor, C } from './Capacitor';
export { Inductor, L } from './Inductor';

// Diodes
export { Diode, D, type DiodeParams } from './Diode';
export { LEDComponent, LED, createLED, RED, GREEN, BLUE, YELLOW, WHITE, ORANGE, PURPLE, CYAN, PINK, AMBER, IR, UV, type LEDParams } from './LED';
export type { LEDColor } from './LED';

// Sources
export { VoltageSource, DC, AC, type VoltageSourceParams } from './VoltageSource';
export { CurrentSource, IDC, IAC, type CurrentSourceParams } from './CurrentSource';
export { Ground, GND } from './Ground';

// Power Rails
export { PowerRail, VCC, VDD, VPOS, VNEG } from './PowerRail';

// Transistors - BJT
export { NPNTransistor, NPN, PNPTransistor, PNP, type BJTParams } from './BJT';

// Transistors - MOSFET
export { NMOSTransistor, NMOS, PMOSTransistor, PMOS, type MOSFETParams } from './MOSFET';

// Analog ICs
export { OpAmpComponent, OpAmp, LM741, TL072, NE5532, LM358, type OpAmpParams } from './OpAmp';
