package com.carddemo.card.interfaces.rest;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.DownstreamUnavailableException;
import com.carddemo.card.domain.exception.ForbiddenException;
import com.carddemo.card.domain.exception.NotFoundException;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.List;
import java.util.stream.Stream;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final String VALIDATION_FAILED = "VALIDATION_FAILED";

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(ex.getCode(), ex.getMessage()));
    }

    /**
     * 领域断言失败默认 409；输入格式/取值不合法（VALIDATION_FAILED）按 400 返回。
     */
    @ExceptionHandler(BusinessRuleException.class)
    public ResponseEntity<ApiError> handleBusinessRule(BusinessRuleException ex) {
        HttpStatus status;
        if (VALIDATION_FAILED.equals(ex.getCode()) || "STAFF_VERIFICATION_REQUIRED".equals(ex.getCode())) {
            status = HttpStatus.BAD_REQUEST;
        } else if ("EXPORT_EXPIRED".equals(ex.getCode())) {
            status = HttpStatus.GONE;
        } else {
            status = HttpStatus.CONFLICT;
        }
        return ResponseEntity.status(status).body(ApiError.of(ex.getCode(), ex.getMessage()));
    }

    /** 后台权限点缺失 → 403；主体缺失（未经过滤器）→ 401。 */
    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiError> handleForbidden(ForbiddenException ex) {
        HttpStatus status = "UNAUTHENTICATED".equals(ex.getCode())
                ? HttpStatus.UNAUTHORIZED
                : HttpStatus.FORBIDDEN;
        return ResponseEntity.status(status).body(ApiError.of(ex.getCode(), ex.getMessage()));
    }

    /** 下游依赖不可用 → 503。 */
    @ExceptionHandler(DownstreamUnavailableException.class)
    public ResponseEntity<ApiError> handleDownstream(DownstreamUnavailableException ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiError.of("DOWNSTREAM_UNAVAILABLE", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .toList();
        return validationFailed(details);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiError> handleMethodValidation(HandlerMethodValidationException ex) {
        List<String> details = ex.getAllValidationResults().stream()
                .flatMap(this::describe)
                .toList();
        return validationFailed(details);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> handleConstraintViolation(ConstraintViolationException ex) {
        List<String> details = ex.getConstraintViolations().stream()
                .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
                .toList();
        return validationFailed(details);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return validationFailed(List.of(ex.getName() + ": value is not valid."));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException ex) {
        return validationFailed(List.of("requestBody: request body is not readable."));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ApiError> handleOptimisticLock(OptimisticLockingFailureException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiError.of("CONCURRENT_UPDATE",
                        "Record changed by some one else. Please review"));
    }

    private Stream<String> describe(ParameterValidationResult result) {
        String name = result.getMethodParameter().getParameterName();
        String field = name != null ? name : "parameter";
        return result.getResolvableErrors().stream()
                .map(error -> field + ": " + error.getDefaultMessage());
    }

    private static ResponseEntity<ApiError> validationFailed(List<String> details) {
        return ResponseEntity.badRequest()
                .body(new ApiError(VALIDATION_FAILED, "Request validation failed", details));
    }
}
