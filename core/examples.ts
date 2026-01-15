/**
 * WireLang Core - Usage Examples
 * 
 * These examples demonstrate the DSL syntax and core functionality
 */

import {
  // Schematic container
  Schematic, createSchematic,
  
  // Components
  R, C, L, D, createLED, DC, AC, GND,
  
  // DSL functions
  Series, Parallel, Circuit, applyToCircuit,
  
  // Units
  kOhm, uF, mH, kHz,
  
  // Colors
  RED, GREEN, BLUE,
} from './index';

// =============================================================================
// Example 1: Simple LED Circuit
// DC source -> Resistor -> LED -> Ground
// =============================================================================

export function simpleLedCircuit(): Schematic {
  return Circuit('LED Blinker',
    DC(5),
    R(330),
    createLED(RED),
    GND()
  );
}

// =============================================================================
// Example 2: Voltage Divider
// Two resistors in series creating a voltage divider
// =============================================================================

export function voltageDivider(): Schematic {
  const s = createSchematic('Voltage Divider');
  
  const source = DC(12);
  const r1 = R(kOhm(10));
  const r2 = R(kOhm(10));
  const ground = GND();
  
  // Build series connection
  const result = Series(source, r1, r2, ground);
  applyToCircuit(s, result);
  
  // The midpoint between r1 and r2 is our voltage divider output
  // In this case, r1.p2 and r2.p1 are connected to the same node
  
  return s;
}

// =============================================================================
// Example 3: Parallel Resistors
// Three resistors in parallel
// =============================================================================

export function parallelResistors(): Schematic {
  const s = createSchematic('Parallel Resistors');
  
  const result = Series(
    DC(9),
    Parallel(
      R(kOhm(1)),
      R(kOhm(2)),
      R(kOhm(3))
    ),
    GND()
  );
  
  applyToCircuit(s, result);
  return s;
}

// =============================================================================
// Example 4: RC Low-Pass Filter
// Resistor and Capacitor forming a low-pass filter
// =============================================================================

export function rcLowPassFilter(): Schematic {
  return Circuit('RC Low-Pass Filter',
    AC(5, kHz(1)),
    R(kOhm(1)),
    C(uF(0.1)),
    GND()
  );
}

// =============================================================================
// Example 5: LC Tank Circuit
// Inductor and Capacitor in parallel (resonant circuit)
// =============================================================================

export function lcTankCircuit(): Schematic {
  const s = createSchematic('LC Tank');
  
  const result = Series(
    DC(12),
    R(100),  // Current limiting resistor
    Parallel(
      L(mH(10)),
      C(uF(1))
    ),
    GND()
  );
  
  applyToCircuit(s, result);
  return s;
}

// =============================================================================
// Example 6: Traffic Light (Multiple LEDs)
// =============================================================================

export function trafficLight(): Schematic {
  const s = createSchematic('Traffic Light');
  
  const source = DC(5);
  const ground = GND();
  
  // Each LED with its current limiting resistor in parallel
  const result = Series(
    source,
    Parallel(
      Series(R(220), createLED(RED)),
      Series(R(220), createLED(GREEN)),
      Series(R(180), createLED(BLUE))  // Blue needs different resistor value
    ),
    ground
  );
  
  applyToCircuit(s, result);
  return s;
}

// =============================================================================
// Example 7: Full-Wave Rectifier (4 diodes)
// =============================================================================

export function fullWaveRectifier(): Schematic {
  const s = createSchematic('Full-Wave Rectifier');
  
  // Create diodes
  const d1 = D('1N4007');
  const d2 = D('1N4007');
  const d3 = D('1N4007');
  const d4 = D('1N4007');
  
  // Add components
  const source = AC(12, 60);
  const loadResistor = R(kOhm(1));
  const filterCap = C(uF(100));
  const ground = GND();
  
  s.addComponents(source, d1, d2, d3, d4, loadResistor, filterCap, ground);
  
  // Manual connections for bridge rectifier
  // This is more complex topology that Series/Parallel can't express directly
  const acPos = s.createNode('AC+');
  const acNeg = s.createNode('AC-');
  const dcPos = s.createNode('DC+');
  const dcNeg = s.createNode('DC-');
  
  // Connect AC source
  s.connect(source.positive, acPos);
  s.connect(source.negative, acNeg);
  
  // Connect diodes in bridge configuration
  s.connect(d1.anode, acPos);
  s.connect(d1.cathode, dcPos);
  
  s.connect(d2.anode, dcNeg);
  s.connect(d2.cathode, acPos);
  
  s.connect(d3.anode, acNeg);
  s.connect(d3.cathode, dcPos);
  
  s.connect(d4.anode, dcNeg);
  s.connect(d4.cathode, acNeg);
  
  // Connect load and filter
  s.connect(loadResistor.p1, dcPos);
  s.connect(loadResistor.p2, dcNeg);
  s.connect(filterCap.p1, dcPos);
  s.connect(filterCap.p2, dcNeg);
  
  // Ground reference
  s.connect(ground.pin, dcNeg);
  
  return s;
}

// =============================================================================
// Run examples and print summaries
// =============================================================================

export function runAllExamples(): void {
  console.log('='.repeat(60));
  console.log('WireLang Core v1 - Examples');
  console.log('='.repeat(60));

  const examples = [
    { name: 'Simple LED Circuit', fn: simpleLedCircuit },
    { name: 'Voltage Divider', fn: voltageDivider },
    { name: 'Parallel Resistors', fn: parallelResistors },
    { name: 'RC Low-Pass Filter', fn: rcLowPassFilter },
    { name: 'LC Tank Circuit', fn: lcTankCircuit },
    { name: 'Traffic Light', fn: trafficLight },
    { name: 'Full-Wave Rectifier', fn: fullWaveRectifier },
  ];

  for (const example of examples) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Example: ${example.name}`);
    console.log('─'.repeat(60));
    
    const circuit = example.fn();
    console.log(circuit.getSummary());
    
    const validation = circuit.validate();
    if (!validation.valid) {
      console.log('\nErrors:');
      validation.errors.forEach(e => console.log(`  ❌ ${e}`));
    }
    if (validation.warnings.length > 0) {
      console.log('\nWarnings:');
      validation.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }
    if (validation.valid && validation.warnings.length === 0) {
      console.log('\n✅ Circuit is valid');
    }
  }
}
