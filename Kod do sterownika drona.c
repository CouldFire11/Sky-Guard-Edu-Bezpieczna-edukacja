#define F_CPU 16000000UL
#include <avr/io.h>
#include <util/delay.h>  
#include <avr/interrupt.h>
#include <util/twi.h>

// --- DEFINICJE PINÓW ---
// Faza C
#define LC_PIN PD5 // Dolny klucz C
#define HC_PIN PD6 // Górny klucz C
// Faza B
#define LB_PIN PD7 // Dolny klucz B
#define HB_PIN PB0 // Górny klucz B
// Faza A
#define LA_PIN PB1 // Dolny klucz A
#define HA_PIN PB2 // Górny klucz A

// Back-EMF
#define BEMF_A PB3
#define BEMF_B PB4
#define BEMF_C PB5

// Adres I2C
#define I2C_SLAVE_ADDRESS 0x10


volatile uint8_t pwm_duty = 0;       // Wype³nienie PWM 0-100 (zadawane przez I2C)
volatile uint8_t current_step = 1;   // Obecny krok komutacji 
volatile uint8_t is_running = 0;      // Flaga, czy silnik wszed³ w tryb Closed Loop
uint16_t open_loop_delay = 5000;      // Pocz¹tkowe opóŸnienie miêdzy krokami (us)
uint16_t current_limit = 500;

// Maski 
volatile uint8_t hs_mask_B = 0, hs_mask_D = 0;
volatile uint8_t ls_mask_B = 0, ls_mask_D = 0;

// Ustawienie masek kroków komutacji 
void set_commutation_step(uint8_t step) {
	// Reset
	hs_mask_B = 0; hs_mask_D = 0;
	ls_mask_B = 0; ls_mask_D = 0;
	
	switch(step) {
		case 1: hs_mask_B = (1<<HA_PIN); ls_mask_D = (1<<LB_PIN); break; // Faza A(H) - Faza B(L)
		case 2: hs_mask_B = (1<<HA_PIN); ls_mask_D = (1<<LC_PIN); break; // Faza A(H) - Faza C(L)
		case 3: hs_mask_B = (1<<HB_PIN); ls_mask_D = (1<<LC_PIN); break; // Faza B(H) - Faza C(L)
		case 4: hs_mask_B = (1<<HB_PIN); ls_mask_B = (1<<LA_PIN); break; // Faza B(H) - Faza A(L)
		case 5: hs_mask_D = (1<<HC_PIN); ls_mask_B = (1<<LA_PIN); break; // Faza C(H) - Faza A(L)
		case 6: hs_mask_D = (1<<HC_PIN); ls_mask_D = (1<<LB_PIN); break; // Faza C(H) - Faza B(L)
	}
	

	PORTB = (PORTB & ~(1<<LA_PIN)) | ls_mask_B;
	PORTD = (PORTD & ~((1<<LC_PIN)|(1<<LB_PIN))) | ls_mask_D;
}

// Inicjalizacja I2C Slave
void I2C_Slave_Init(uint8_t address) {
	TWAR = (address << 1); 
	TWCR = (1<<TWEN) | (1<<TWEA) | (1<<TWINT) | (1<<TWIE); 
}

// Inicjalizacja ADC
void ADC_Init() {
	ADMUX = (1<<REFS0); // Referencja AVCC
	ADCSRA = (1<<ADEN) | (1<<ADPS2) | (1<<ADPS1) | (1<<ADPS0); 
}

// --- PRZERWANIA ---


ISR(TIMER2_COMPA_vect) {
	static uint8_t pwm_counter = 0;
	pwm_counter++;
	if (pwm_counter >= 100) pwm_counter = 0;
	
	if (pwm_counter < pwm_duty && pwm_duty > 0) {
		// W³¹cz aktywne górne klucze
		PORTB |= hs_mask_B;
		PORTD |= hs_mask_D;
		} else {
		// Wy³¹cz aktywne górne klucze
		PORTB &= ~(1<<HA_PIN | 1<<HB_PIN);
		PORTD &= ~(1<<HC_PIN);
	}
}


ISR(PCINT0_vect) {

	current_step++;
	if(current_step > 6) current_step = 1;
	
	set_commutation_step(current_step);
}

ISR(TWI_vect) {
	switch(TWSR & 0xF8) {
		case TW_SR_SLA_ACK:      
		TWCR = (1<<TWEN)|(1<<TWIE)|(1<<TWINT)|(1<<TWEA);
		break;
		case TW_SR_DATA_ACK:     
		pwm_duty = TWDR;     
		TWCR = (1<<TWEN)|(1<<TWIE)|(1<<TWINT)|(1<<TWEA);
		break;
		case TW_SR_STOP:         
		TWCR = (1<<TWEN)|(1<<TWIE)|(1<<TWINT)|(1<<TWEA);
		break;
		default:
		TWCR = (1<<TWEN)|(1<<TWIE)|(1<<TWINT)|(1<<TWEA);
		break;
	}
}

int main(void) {
	// Piny mostka
	DDRB |= (1<<HA_PIN) | (1<<LA_PIN) | (1<<HB_PIN);
	DDRD |= (1<<HC_PIN) | (1<<LC_PIN) | (1<<LB_PIN);
	
	// Piny Back-EMF 
	DDRB &= ~((1<<BEMF_A) | (1<<BEMF_B) | (1<<BEMF_C));
	PORTB &= ~((1<<BEMF_A) | (1<<BEMF_B) | (1<<BEMF_C)); // Wy³¹czenie pull-up
	
	PCICR |= (1<<PCIE0);
	PCMSK0 |= (1<<PCINT3) | (1<<PCINT4) | (1<<PCINT5);

	// Konfiguracja Timera 2 
	TCCR2A = (1<<WGM21);
	TCCR2B = (1<<CS21);  
	OCR2A = 39;          
	TIMSK2 |= (1<<OCIE2A);

	I2C_Slave_Init(I2C_SLAVE_ADDRESS);
	ADC_Init();
	
	sei(); 

	set_commutation_step(current_step);

	while (1) {
		ADMUX = (ADMUX & 0xF0) | 0; 
		ADCSRA |= (1<<ADSC);        
		while(ADCSRA & (1<<ADSC));  
		
		if (ADC > current_limit) {
			// Przeci¹¿enie 
			pwm_duty = 0;
			is_running = 0;
			PORTB &= ~( (1<<HA_PIN) | (1<<HB_PIN) | (1<<LA_PIN) );
			PORTD &= ~( (1<<HC_PIN) | (1<<LC_PIN) | (1<<LB_PIN) );
		}

		// PROCEDURA STARTOWA (OPEN LOOP)
		if (pwm_duty > 10 && !is_running) {

			
			open_loop_delay = 5000; 
			
			for (uint16_t i = 0; i < 100; i++) {
				current_step++;
				if (current_step > 6) current_step = 1;
				
				set_commutation_step(current_step);
				
				for(uint16_t d = 0; d < open_loop_delay; d++) {
					_delay_us(1);
				}
				
				if (open_loop_delay > 800) open_loop_delay -= 40;
				
				if (pwm_duty == 0) break;
			}
			

			is_running = 1;
		}

	
		if (pwm_duty == 0) {
			is_running = 0;
	
			PORTB &= ~((1<<HA_PIN) | (1<<HB_PIN) | (1<<LA_PIN));
			PORTD &= ~((1<<HC_PIN) | (1<<LC_PIN) | (1<<LB_PIN));
		}
		
	
	}
	
}