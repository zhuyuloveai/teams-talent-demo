package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;

/** 后台权限点（本地演示，ADR-012 先例）：权限来自 token 主体，不信任请求体。 */
@Entity
@Table(name = "card_permission")
@IdClass(CardPermission.Key.class)
public class CardPermission {

    public static final String LOSS_ASSIST = "card:loss:assist";
    public static final String REPLACEMENT_READ_ANY = "replacement:read:any";
    public static final String REPLACEMENT_CANCEL_ASSIST = "replacement:cancel:assist";
    public static final String REPLACEMENT_STATUS_UPDATE = "replacement:status:update";

    @Id
    @Column(name = "user_id", length = 16, nullable = false, updatable = false)
    private String userId;

    @Id
    @Column(name = "permission", length = 64, nullable = false, updatable = false)
    private String permission;

    protected CardPermission() {
        // for JPA
    }

    public String getUserId() {
        return userId;
    }

    public String getPermission() {
        return permission;
    }

    public static class Key implements Serializable {

        private String userId;
        private String permission;

        public Key() {
        }

        public Key(String userId, String permission) {
            this.userId = userId;
            this.permission = permission;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Key key)) {
                return false;
            }
            return Objects.equals(userId, key.userId) && Objects.equals(permission, key.permission);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, permission);
        }
    }
}
