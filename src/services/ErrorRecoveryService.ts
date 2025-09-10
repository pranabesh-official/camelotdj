import { RobustDatabaseService } from './RobustDatabaseService';

export interface ErrorRecoveryConfig {
  maxRetries: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
  recoveryTimeout: number;
  healthCheckInterval: number;
}

export interface RecoveryAction {
  id: string;
  type: 'retry' | 'fallback' | 'circuit_breaker' | 'health_check' | 'reconnect';
  description: string;
  timestamp: number;
  success: boolean;
  error?: string;
  duration: number;
}

export interface ErrorContext {
  operation: string;
  endpoint: string;
  error: Error;
  retryCount: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class ErrorRecoveryService {
  private databaseService: RobustDatabaseService;
  private config: ErrorRecoveryConfig;
  private recoveryActions: RecoveryAction[] = [];
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerFailures: number = 0;
  private lastRecoveryAttempt: number = 0;
  private isRecovering: boolean = false;

  constructor(databaseService: RobustDatabaseService, config?: Partial<ErrorRecoveryConfig>) {
    this.databaseService = databaseService;
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 5,
      recoveryTimeout: 30000,
      healthCheckInterval: 10000,
      ...config
    };

    // Start periodic health monitoring
    this.startHealthMonitoring();
  }

  private startHealthMonitoring(): void {
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const health = this.databaseService.getHealthStatus();
      
      if (health.status === 'unhealthy' && !this.isRecovering) {
        console.warn('Database health check failed, initiating recovery...');
        await this.initiateRecovery('health_check', 'Health check detected unhealthy status');
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  private async initiateRecovery(type: RecoveryAction['type'], description: string): Promise<boolean> {
    if (this.isRecovering) {
      console.log('Recovery already in progress, skipping...');
      return false;
    }

    this.isRecovering = true;
    const startTime = Date.now();
    const actionId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`Initiating recovery: ${description}`);

    try {
      let success = false;

      switch (type) {
        case 'retry':
          success = await this.performRetryRecovery();
          break;
        case 'fallback':
          success = await this.performFallbackRecovery();
          break;
        case 'circuit_breaker':
          success = await this.performCircuitBreakerRecovery();
          break;
        case 'health_check':
          success = await this.performHealthCheckRecovery();
          break;
        case 'reconnect':
          success = await this.performReconnectRecovery();
          break;
        default:
          throw new Error(`Unknown recovery type: ${type}`);
      }

      const duration = Date.now() - startTime;
      this.recordRecoveryAction({
        id: actionId,
        type,
        description,
        timestamp: startTime,
        success,
        duration
      });

      if (success) {
        console.log(`Recovery successful: ${description} (${duration}ms)`);
        this.circuitBreakerFailures = 0;
        this.circuitBreakerOpen = false;
      } else {
        console.error(`Recovery failed: ${description} (${duration}ms)`);
        this.circuitBreakerFailures++;
      }

      return success;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordRecoveryAction({
        id: actionId,
        type,
        description,
        timestamp: startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      console.error(`Recovery error: ${error}`);
      return false;
    } finally {
      this.isRecovering = false;
      this.lastRecoveryAttempt = Date.now();
    }
  }

  private async performRetryRecovery(): Promise<boolean> {
    console.log('Performing retry recovery...');
    
    // Wait for a short period before retrying
    await this.sleep(this.config.retryDelay);
    
    try {
      // Test basic connectivity
      await this.databaseService.getLibrary();
      return true;
    } catch (error) {
      console.error('Retry recovery failed:', error);
      return false;
    }
  }

  private async performFallbackRecovery(): Promise<boolean> {
    console.log('Performing fallback recovery...');
    
    try {
      // Implement fallback strategies
      // 1. Try with reduced timeout
      // 2. Try with different endpoint
      // 3. Use cached data if available
      
      // For now, just retry with basic operation
      await this.databaseService.getLibrary();
      return true;
    } catch (error) {
      console.error('Fallback recovery failed:', error);
      return false;
    }
  }

  private async performCircuitBreakerRecovery(): Promise<boolean> {
    console.log('Performing circuit breaker recovery...');
    
    if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerOpen = true;
      console.log('Circuit breaker opened due to repeated failures');
      
      // Wait for recovery timeout before attempting to close
      await this.sleep(this.config.recoveryTimeout);
      
      try {
        // Test if service is back online
        await this.databaseService.getLibrary();
        this.circuitBreakerOpen = false;
        this.circuitBreakerFailures = 0;
        console.log('Circuit breaker closed - service recovered');
        return true;
      } catch (error) {
        console.error('Circuit breaker recovery failed:', error);
        return false;
      }
    }
    
    return true;
  }

  private async performHealthCheckRecovery(): Promise<boolean> {
    console.log('Performing health check recovery...');
    
    try {
      // Force a health check
      const health = this.databaseService.getHealthStatus();
      
      if (health.status === 'healthy') {
        return true;
      } else if (health.status === 'degraded') {
        // Try to recover from degraded state
        await this.sleep(2000);
        const newHealth = this.databaseService.getHealthStatus();
        return newHealth.status === 'healthy';
      } else {
        // Unhealthy - try reconnection
        return await this.performReconnectRecovery();
      }
    } catch (error) {
      console.error('Health check recovery failed:', error);
      return false;
    }
  }

  private async performReconnectRecovery(): Promise<boolean> {
    console.log('Performing reconnect recovery...');
    
    try {
      // Destroy and recreate the database service connection
      this.databaseService.destroy();
      
      // Wait a moment for cleanup
      await this.sleep(1000);
      
      // The service should be recreated by the parent component
      // For now, just test if it's working
      await this.databaseService.getLibrary();
      return true;
    } catch (error) {
      console.error('Reconnect recovery failed:', error);
      return false;
    }
  }

  private recordRecoveryAction(action: RecoveryAction): void {
    this.recoveryActions.push(action);
    
    // Keep only last 100 actions
    if (this.recoveryActions.length > 100) {
      this.recoveryActions = this.recoveryActions.slice(-100);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async handleError(errorContext: ErrorContext): Promise<boolean> {
    console.error(`Handling error for operation ${errorContext.operation}:`, errorContext.error);

    // Check if we should open circuit breaker
    if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
      console.log('Circuit breaker threshold reached, opening circuit');
      this.circuitBreakerOpen = true;
      return false;
    }

    // Determine recovery strategy based on error type
    let recoveryType: RecoveryAction['type'] = 'retry';
    
    if (errorContext.error.message.includes('timeout')) {
      recoveryType = 'fallback';
    } else if (errorContext.error.message.includes('connection')) {
      recoveryType = 'reconnect';
    } else if (errorContext.retryCount >= this.config.maxRetries) {
      recoveryType = 'circuit_breaker';
    }

    // Perform recovery
    const success = await this.initiateRecovery(
      recoveryType,
      `Error recovery for ${errorContext.operation}: ${errorContext.error.message}`
    );

    return success;
  }

  public isCircuitBreakerOpen(): boolean {
    return this.circuitBreakerOpen;
  }

  public getRecoveryStats(): {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    circuitBreakerOpen: boolean;
    consecutiveFailures: number;
    lastRecoveryAttempt: number;
  } {
    const successful = this.recoveryActions.filter(a => a.success).length;
    const failed = this.recoveryActions.filter(a => !a.success).length;

    return {
      totalActions: this.recoveryActions.length,
      successfulActions: successful,
      failedActions: failed,
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveFailures: this.circuitBreakerFailures,
      lastRecoveryAttempt: this.lastRecoveryAttempt
    };
  }

  public getRecoveryHistory(): RecoveryAction[] {
    return [...this.recoveryActions].reverse(); // Most recent first
  }

  public resetCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.circuitBreakerFailures = 0;
    console.log('Circuit breaker manually reset');
  }

  public destroy(): void {
    // Cleanup any ongoing recovery processes
    this.isRecovering = false;
    this.recoveryActions = [];
  }
}
